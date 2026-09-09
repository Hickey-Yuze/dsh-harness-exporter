/**
 * DSH Harness Exporter - Host half
 * Exports all DSH configuration files, plugins, agent presets, and sessions
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

const name = 'dsh-harness-exporter';
const inject = ['webServer', 'tools'];

function apply(ctx) {
  const agentPresets = ctx.get('agentPresets');

  // Recursively copy a preset directory tree (agent.cordis.yml, preset.yml,
  // skills/**). Buffer reads/writes keep non-UTF-8 skill assets intact.
  function copyDirRecursive(src, dst) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      const s = join(src, entry);
      const d = join(dst, entry);
      let st = null;
      try { st = statSync(s); } catch (e) { continue; }
      if (st.isDirectory()) copyDirRecursive(s, d);
      else try { writeFileSync(d, readFileSync(s)); } catch (e) { /* skip */ }
    }
  }

  function getDshHome() {
    return process.env.DSH_HOME || join(homedir(), '.dsh');
  }

  function collectConfigFiles(dshHome) {
    const result = [];
    const paths = [];
    // Export every profile that exists on this machine (desktop for the
    // desktop app, web for web deployments) plus global config files.
    for (const profile of ['web', 'desktop', 'work']) {
      for (const file of ['cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
        paths.push({ rel: 'profiles/' + profile + '/' + file, label: 'Profile ' + profile + ': ' + file });
      }
    }
    paths.push(
      { rel: 'cordis.yml', label: '根 Cordis 配置' },
      { rel: 'settings.yaml', label: '设置' },
      { rel: 'storages/workspace.json', label: '工作区注册表' }
    );

    for (const entry of paths) {
      try {
        const fullPath = join(dshHome, entry.rel);
        if (existsSync(fullPath)) {
          const info = statSync(fullPath);
          if (info.isFile()) {
            const content = readFileSync(fullPath, 'utf-8');
            result.push({ path: entry.rel, label: entry.label, content, size: info.size });
          }
        }
      } catch (e) {
        // skip
      }
    }
    return result;
  }

  async function collectPresets() {
    const presets = [];
    try {
      if (agentPresets) {
        const list = await agentPresets.list();
        for (const preset of list) {
          let comp = '';
          try {
            comp = await agentPresets.read(preset.id);
          } catch (e) {
            // skip
          }
          // The preset's directory (dirname of its composition file) —
          // needed to stage the whole tree (preset.yml, skills/**).
          let dir = null;
          try { dir = preset.path ? pathResolve(preset.path, '..') : null; } catch (e) { /* skip */ }
          presets.push({
            id: preset.id,
            name: preset.name || preset.id,
            composition: comp,
            dir
          });
        }
      }
    } catch (e) {
      // skip
    }
    return presets;
  }

  function extractSessionTitle(sessionPath) {
    try {
      const files = readdirSync(sessionPath);
      const logFile = files.find(f => f.endsWith('.zstd') || f.endsWith('.zst'));
      if (!logFile) return null;
      
      const logPath = join(sessionPath, logFile);
      
      // 读取前 8KB 尝试解压
      const fd = openSync(logPath, 'r');
      const buf = Buffer.alloc(8192);
      readSync(fd, buf, 0, 8192, 0);
      closeSync(fd);
      
      // 尝试解压
      try {
        const text = inflateSync(buf).toString('utf-8');
        const lines = text.split('\n').filter(l => l.trim());
        
        // 查找第一条 user 消息
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'user' && event.content) {
              const content = typeof event.content === 'string' 
                ? event.content 
                : (Array.isArray(event.content) ? event.content[0]?.text : event.content.text);
              if (content) {
                // 取前 50 字符作为标题
                return content.slice(0, 50).replace(/\n/g, ' ').trim();
              }
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        // 解压失败，返回 null
      }
    } catch (e) {
      // 读取失败
    }
    return null;
  }

  function collectSessions(dshHome, filter) {
    const sessions = [];
    const sdir = join(dshHome, 'sessions');
    try {
      if (!existsSync(sdir)) return sessions;
      const wsDirs = readdirSync(sdir);
      for (const ws of wsDirs) {
        if (ws.startsWith('.')) continue;
        // 工作区过滤
        if (filter && filter.workspace && ws !== filter.workspace) continue;
        const wsPath = join(sdir, ws);
        try {
          const wsStat = statSync(wsPath);
          if (!wsStat.isDirectory()) continue;
          const sDirs = readdirSync(wsPath);
          for (const sd of sDirs) {
            if (!sd.startsWith('session-')) continue;
            // 会话ID过滤
            if (filter && filter.sessionIds && filter.sessionIds.length > 0 && !filter.sessionIds.includes(sd)) continue;
            const sp = join(wsPath, sd);
            try {
              const spStat = statSync(sp);
              if (!spStat.isDirectory()) continue;
              const files = readdirSync(sp);
              
              // 提取会话标题
              const title = extractSessionTitle(sp) || sd;
              
              sessions.push({
                id: sd,
                title: title,
                workspace: ws,
                path: sp,
                files: files.map(f => {
                  try {
                    const fStat = statSync(join(sp, f));
                    return { name: f, size: fStat.size, path: join(sp, f) };
                  } catch {
                    return { name: f, size: 0, path: join(sp, f) };
                  }
                })
              });
            } catch (e) {
              // skip
            }
          }
        } catch (e) {
          // skip
        }
      }
    } catch (e) {
      // skip
    }
    return sessions;
  }

  async function doExportAsync(outputDir, options) {
    const dshHome = getDshHome();
    if (!outputDir) outputDir = join(dshHome, 'exports');

    // Normalize options: UNDEFINED means export (the documented "未指定则导出"
    // semantics). A selective caller (agent tool / API) that passes only some
    // flags must not silently zero the rest — only an explicit false skips.
    const o = options || {};
    const opts = {
      configs: o.configs !== false,
      presets: o.presets !== false,
      sessions: o.sessions !== false
    };
    // 会话过滤：workspace 或 sessionIds
    const sessionFilter = o.sessionIds ? { sessionIds: o.sessionIds } : (o.workspace ? { workspace: o.workspace } : null);

    const cfgs = opts.configs ? collectConfigFiles(dshHome) : [];
    const prsts = opts.presets ? await collectPresets() : [];
    const sess = opts.sessions ? collectSessions(dshHome, sessionFilter) : [];

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = 'dsh-export-' + ts;
    const staging = join(outputDir, archiveName);

    // Create staging directories
    const dirs = [
      join(staging, 'configs'),
      join(staging, 'presets'),
      join(staging, 'sessions')
    ];
    for (const dir of dirs) {
      try { mkdirSync(dir, { recursive: true }); } catch (e) { /* skip */ }
    }

    // Write config files
    for (const cfg of cfgs) {
      const sn = cfg.path.replace(/\//g, '_');
      try { writeFileSync(join(staging, 'configs', sn), cfg.content, 'utf-8'); } catch (e) { /* skip */ }
    }

    // Write presets — stage each preset as a full DIRECTORY (agent.cordis.yml
    // + preset.yml + skills/**), matching dsh-agent-presets' real layout: a
    // preset is a directory holding agent.cordis.yml; flat <id>.yml files are
    // ignored by discovery. The composition from the service is the fallback
    // when the directory itself is unreadable.
    for (const prst of prsts) {
      const sn = prst.id.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const pDir = join(staging, 'presets', sn);
      try {
        mkdirSync(pDir, { recursive: true });
        if (prst.dir && existsSync(prst.dir)) {
          copyDirRecursive(prst.dir, pDir);
        } else if (prst.composition) {
          writeFileSync(join(pDir, 'agent.cordis.yml'), prst.composition, 'utf-8');
        }
      } catch (e) { /* skip */ }
    }

    // Write session manifest
    const sm = sess.map(s => ({
      id: s.id, workspace: s.workspace,
      files: s.files.map(f => ({ name: f.name, size: f.size }))
    }));
    try { writeFileSync(join(staging, 'sessions', 'manifest.json'), JSON.stringify(sm, null, 2), 'utf-8'); } catch (e) { /* skip */ }

    // Copy session files — BINARY copy, preserving the real layout
    // sessions/<workspace>/<session-id>/: session logs embed their workspace
    // identity and the workspace plugin rejects them (refusing to start the
    // whole Harness) if the directory name does not match.
    for (const s of sess) {
      for (const f of s.files) {
        const dd = join(staging, 'sessions', s.workspace, s.id);
        try {
          mkdirSync(dd, { recursive: true });
          const content = readFileSync(f.path);
          writeFileSync(join(dd, f.name), content);
        } catch (e) { /* skip */ }
      }
    }

    // Write summary
    const summary = {
      exportedAt: new Date().toISOString(),
      dshHome,
      configFiles: cfgs.length,
      presets: prsts.length,
      sessions: sess.length
    };
    try { writeFileSync(join(staging, 'export-summary.json'), JSON.stringify(summary, null, 2), 'utf-8'); } catch (e) { /* skip */ }

    // Create zip archive
    let archivePath = '';
    try {
      mkdirSync(outputDir, { recursive: true });
      archivePath = join(outputDir, archiveName + '.zip');
      if (process.platform === 'win32') {
        execSync(`powershell -Command "Compress-Archive -Path '${staging.replace(/'/g, "''")}' -DestinationPath '${archivePath.replace(/'/g, "''")}' -Force"`, { stdio: 'ignore' });
      } else {
        execSync(`cd "${outputDir}" && zip -r "${archiveName}.zip" "${archiveName}"`, { stdio: 'ignore' });
      }
    } catch (e) { /* skip */ }

    // Cleanup staging
    try { rmSync(staging, { recursive: true, force: true }); } catch (e) { /* skip */ }

    return {
      success: true,
      archivePath: archivePath || staging,
      archiveName: archiveName + '.zip',
      summary,
      configFiles: cfgs.map(c => ({ path: c.path, label: c.label })),
      presets: prsts.map(p => ({ id: p.id, name: p.name })),
      sessions: sess.map(s => ({ id: s.id, workspace: s.workspace, fileCount: s.files.length }))
    };
  }

  async function doImport(importPath) {
    const dshHome = getDshHome();
    let actualImportPath = importPath;
    let tempDir = null;

    if (importPath.endsWith('.zip')) {
      const ts = new Date().getTime();
      tempDir = join(dshHome, 'exports', '.import-temp-' + ts);

      try {
        mkdirSync(tempDir, { recursive: true });
        if (process.platform === 'win32') {
          execSync(`powershell -Command "Expand-Archive -Path '${importPath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force"`, { stdio: 'ignore' });
        } else {
          execSync(`unzip -o "${importPath}" -d "${tempDir}"`, { stdio: 'ignore' });
        }
        const entries = readdirSync(tempDir);
        if (entries.length > 0) {
          const first = join(tempDir, entries[0]);
          if (statSync(first).isDirectory()) {
            actualImportPath = first;
          } else {
            actualImportPath = tempDir;
          }
        } else {
          actualImportPath = tempDir;
        }
      } catch (e) {
        throw new Error('解压失败：' + (e.message || String(e)));
      }
    } else {
      if (!existsSync(importPath) || !statSync(importPath).isDirectory()) {
        throw new Error('导入路径不存在或不是目录：' + importPath);
      }
    }

    // The archive must contain at least one of the export payloads. If the
    // detected root has none, look one level down for a single nested folder —
    // otherwise refuse with a clear error instead of a fake success.
    function looksLikeExportRoot(dir) {
      return existsSync(join(dir, 'configs')) || existsSync(join(dir, 'presets')) || existsSync(join(dir, 'sessions'));
    }
    if (!looksLikeExportRoot(actualImportPath)) {
      let nested = null;
      try {
        const children = readdirSync(actualImportPath).filter((c) => {
          try { return statSync(join(actualImportPath, c)).isDirectory(); } catch (e) { return false; }
        });
        nested = children.find((c) => looksLikeExportRoot(join(actualImportPath, c))) || null;
      } catch (e) { /* keep null */ }
      if (nested) {
        actualImportPath = join(actualImportPath, nested);
      } else {
        throw new Error('压缩包里没有找到导出内容（configs/presets/sessions）。请选择通过本插件「导出配置」生成的 zip 文件。');
      }
    }

    const restored = { configs: 0, presets: 0, sessions: 0 };
    const skipped = { corruptSessionLogs: 0, machineSpecificConfigs: 0, unknownWorkspaceSessions: 0 };

    // Machine/layout-specific profile files must never be restored from an
    // archive made on another machine: package.json carries link: deps with
    // absolute paths, and lockfile/workspace state describe a foreign tree.
    const MACHINE_SPECIFIC_CONFIG = /(^|_)package\.json$|(^|_)pnpm-lock\.yaml$|(^|_)pnpm-workspace\.yaml$/i;

    // Session logs are Zstandard-compressed; verify the frame magic before
    // writing so a corrupt archive cannot brick the workspace plugin.
    function isZstdFrame(buf) {
      return buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xB5 && buf[2] === 0x2F && buf[3] === 0xFD;
    }

    // Merge the source machine's workspace registry into the target's. The
    // UI lists sessions from the registry's per-workspace sessionIds (not
    // from a directory scan), so imported sessions stay invisible until their
    // ids are attached to a workspace record here. Overwriting the whole file
    // is not an option: it would drop the target's own workspaces, and the
    // live registry service rewrites the file from memory.
    function mergeWorkspaceRegistry(targetPath, sourceRegistry) {
      let target = null;
      try { target = JSON.parse(readFileSync(targetPath, 'utf-8')); } catch (e) { target = null; }
      if (!target || typeof target !== 'object' || !target.tables || !target.tables.workspaces) {
        // No usable target registry: adopt the source one wholesale.
        target = JSON.parse(JSON.stringify(sourceRegistry));
        try { writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf-8'); } catch (e) { /* skip */ }
        const wsCount = Object.keys((sourceRegistry.tables && sourceRegistry.tables.workspaces) || {}).length;
        const sesCount = Object.values((sourceRegistry.tables && sourceRegistry.tables.workspaces) || {})
          .reduce((n, r) => n + ((r && Array.isArray(r.sessionIds)) ? r.sessionIds.length : 0), 0);
        return { mergedWorkspaces: wsCount, mergedSessions: sesCount };
      }
      const tw = target.tables.workspaces;
      const srcTw = (sourceRegistry.tables && sourceRegistry.tables.workspaces) || {};
      let mergedSessions = 0;
      let mergedWorkspaces = 0;
      for (const [sid, rec] of Object.entries(srcTw)) {
        if (!rec || !rec.path) continue;
        const existing = Object.entries(tw).find(([, r]) => r && r.path === rec.path);
        if (existing) {
          const [eid, erec] = existing;
          erec.sessionIds = Array.isArray(erec.sessionIds) ? erec.sessionIds.slice() : [];
          const before = erec.sessionIds.length;
          for (const s of (rec.sessionIds || [])) {
            if (!erec.sessionIds.includes(s)) erec.sessionIds.push(s);
          }
          mergedSessions += erec.sessionIds.length - before;
          if (!Array.isArray(target.global.workspaceIds)) target.global.workspaceIds = [];
          if (!target.global.workspaceIds.includes(eid)) target.global.workspaceIds.push(eid);
        } else {
          tw[sid] = rec;
          mergedSessions += Array.isArray(rec.sessionIds) ? rec.sessionIds.length : 0;
          mergedWorkspaces++;
          if (!Array.isArray(target.global.workspaceIds)) target.global.workspaceIds = [];
          if (!target.global.workspaceIds.includes(sid)) target.global.workspaceIds.push(sid);
        }
      }
      if (Array.isArray(sourceRegistry.global && sourceRegistry.global.archivedSessionIds)) {
        if (!Array.isArray(target.global.archivedSessionIds)) target.global.archivedSessionIds = [];
        for (const s of sourceRegistry.global.archivedSessionIds) {
          if (!target.global.archivedSessionIds.includes(s)) target.global.archivedSessionIds.push(s);
        }
      }
      // Import restores the state captured at export time: sessions the
      // source registry holds as ACTIVE members must not stay archived on
      // the target. There is no unarchive API on the registry service, so
      // this file edit (plus a restart) is the only way to unarchive.
      const srcActive = new Set();
      for (const rec of Object.values(srcTw)) {
        for (const s of ((rec && rec.sessionIds) || [])) srcActive.add(s);
      }
      let unarchivedSessions = 0;
      if (srcActive.size > 0 && Array.isArray(target.global.archivedSessionIds)) {
        const before = target.global.archivedSessionIds.length;
        target.global.archivedSessionIds = target.global.archivedSessionIds.filter((s) => !srcActive.has(s));
        unarchivedSessions = before - target.global.archivedSessionIds.length;
      }
      try { writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf-8'); } catch (e) { /* skip */ }
      return { mergedWorkspaces, mergedSessions, unarchivedSessions };
    }

    try {
      // Restore config files
      let sourceRegistryForAttach = null;
      const configsDir = join(actualImportPath, 'configs');
      if (existsSync(configsDir)) {
        const configFiles = readdirSync(configsDir);
        for (const f of configFiles) {
          if (f === '.keep') continue;
          try {
            if (f === 'storages_workspace.json') {
              // Merge, never overwrite: the registry owns session visibility.
              try {
                const sourceRegistry = JSON.parse(readFileSync(join(configsDir, f), 'utf-8'));
                sourceRegistryForAttach = sourceRegistry;
                const m = mergeWorkspaceRegistry(join(dshHome, 'storages', 'workspace.json'), sourceRegistry);
                restored.mergedWorkspaces = (restored.mergedWorkspaces || 0) + m.mergedWorkspaces;
                restored.mergedSessions = (restored.mergedSessions || 0) + m.mergedSessions;
                restored.unarchivedSessions = (restored.unarchivedSessions || 0) + (m.unarchivedSessions || 0);
                // Session cwd must realpath-resolve on THIS machine: workspaces
                // whose folders are missing here cannot claim their sessions.
                const missing = [];
                const seenPaths = new Set();
                for (const rec of Object.values((sourceRegistry.tables && sourceRegistry.tables.workspaces) || {})) {
                  if (!rec || !rec.path || seenPaths.has(rec.path)) continue;
                  seenPaths.add(rec.path);
                  if (!existsSync(rec.path)) missing.push(rec.path);
                }
                if (missing.length > 0) restored.missingWorkspacePaths = missing;
              } catch (e) { /* skip */ }
              continue;
            }
            if (MACHINE_SPECIFIC_CONFIG.test(f)) {
              skipped.machineSpecificConfigs++;
              continue;
            }
            const content = readFileSync(join(configsDir, f), 'utf-8');
            const origPath = f.replace(/_/g, '/');
            const dstPath = join(dshHome, origPath);
            const dstDir = pathResolve(dstPath, '..');
            mkdirSync(dstDir, { recursive: true });
            writeFileSync(dstPath, content, 'utf-8');
            restored.configs++;
          } catch (e) { /* skip */ }
        }
      }

      // Restore presets. A preset is a DIRECTORY holding agent.cordis.yml
      // under the USER root <dshHome>/.agent-presets/ (dot prefix) — flat
      // <id>.yml files are ignored by dsh-agent-presets discovery entirely.
      // Directory entries from new exports are copied wholesale; legacy flat
      // exports are converted to the directory layout so they actually show.
      // Discovery re-scans on every roster read, so restored presets are
      // visible without a restart.
      const presetsDir = join(actualImportPath, 'presets');
      if (existsSync(presetsDir)) {
        const presetsStoreDir = join(dshHome, '.agent-presets');
        mkdirSync(presetsStoreDir, { recursive: true });
        const presetEntries = readdirSync(presetsDir);
        for (const f of presetEntries) {
          if (f === '.keep' || f === 'manifest.json') continue;
          try {
            const srcPath = join(presetsDir, f);
            const st = statSync(srcPath);
            let presetId = null;
            if (st.isDirectory()) {
              presetId = f.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
            } else if (f.endsWith('.yml') || f.endsWith('.yaml')) {
              presetId = f.replace(/\.ya?ml$/i, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
            }
            if (!presetId || !/^[a-z0-9][a-z0-9-]*$/.test(presetId)) {
              skipped.invalidPresetIds = (skipped.invalidPresetIds || 0) + 1;
              continue;
            }
            const dstDir = join(presetsStoreDir, presetId);
            if (st.isDirectory()) {
              copyDirRecursive(srcPath, dstDir);
            } else {
              mkdirSync(dstDir, { recursive: true });
              writeFileSync(join(dstDir, 'agent.cordis.yml'), readFileSync(srcPath, 'utf-8'), 'utf-8');
            }
            restored.presets++;
          } catch (e) { /* skip */ }
        }
      }

      // Plugin manifest: plugins are NOT auto-reinstalled (they live outside
      // the DSH home as git clones / node_modules links). Save the manifest
      // somewhere findable and surface the list in the import result.
      const pluginManifestPath = join(actualImportPath, 'plugins', 'manifest.json');
      if (existsSync(pluginManifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(pluginManifestPath, 'utf-8'));
          if (Array.isArray(manifest) && manifest.length > 0) {
            restored.pluginList = manifest.map(p => ({ name: p.name || p.id, version: p.version || '' }));
            try {
              const exportsDir = join(dshHome, 'exports');
              mkdirSync(exportsDir, { recursive: true });
              writeFileSync(join(exportsDir, 'restored-plugin-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
            } catch (e) { /* skip */ }
          }
        } catch (e) { /* skip */ }
      }

      // Restore sessions. Session logs embed their workspace identity, so
      // they must land under sessions/<workspace>/<session-id>/ exactly as
      // exported — restoring them into a foreign workspace folder makes the
      // workspace plugin reject them at startup ("corrupt session log").
      const sessionsDir = join(actualImportPath, 'sessions');
      if (existsSync(sessionsDir)) {
        // The manifest (present in every export) maps session id -> workspace.
        const wsById = {};
        const manifestPath = join(sessionsDir, 'manifest.json');
        if (existsSync(manifestPath)) {
          try {
            for (const m of JSON.parse(readFileSync(manifestPath, 'utf-8'))) {
              if (m && m.id && m.workspace) wsById[m.id] = m.workspace;
            }
          } catch (e) { /* ignore */ }
        }
        const importSessionDir = (sessPath, id, workspace) => {
          const dstSessPath = join(dshHome, 'sessions', workspace, id);
          mkdirSync(dstSessPath, { recursive: true });
          let wrote = 0;
          for (const f of readdirSync(sessPath)) {
            if (f === '.keep') continue;
            try {
              const data = readFileSync(join(sessPath, f));
              const lower = f.toLowerCase();
              if ((lower.endsWith('.zst') || lower.endsWith('.zstd')) && !isZstdFrame(data)) {
                skipped.corruptSessionLogs++;
                continue;
              }
              writeFileSync(join(dstSessPath, f), data);
              wrote++;
            } catch (e) { /* skip */ }
          }
          return wrote > 0;
        };
        for (const sd of readdirSync(sessionsDir)) {
          if (sd === '.keep' || sd === 'manifest.json') continue;
          const sessPath = join(sessionsDir, sd);
          let isDir = false;
          try { isDir = statSync(sessPath).isDirectory(); } catch (e) { continue; }
          if (!isDir) continue;
          const subDirs = readdirSync(sessPath).filter((c) => {
            try { return statSync(join(sessPath, c)).isDirectory(); } catch (e) { return false; }
          });
          if (subDirs.length > 0 && wsById[sd] === undefined) {
            // New layout: sessions/<workspace>/<session-id>/
            let restoredAny = false;
            for (const id of subDirs) {
              try {
                if (importSessionDir(join(sessPath, id), id, sd)) restoredAny = true;
              } catch (e) { /* skip */ }
            }
            if (restoredAny) restored.sessions++;
          } else {
            // Legacy layout: sessions/<session-id>/ with manifest mapping
            const workspace = wsById[sd];
            if (!workspace) {
              skipped.unknownWorkspaceSessions++;
              continue;
            }
            try {
              if (importSessionDir(sessPath, sd, workspace)) restored.sessions++;
            } catch (e) { /* skip */ }
          }
        }
      }

      // Live registration: attach imported sessions to their workspaces
      // through the running workspaceRegistry service. This is what makes
      // them visible: the UI lists sessions from the registry's sessionIds,
      // and the service writes durably (no file-clobber race, no restart
      // needed). attachSession re-reads each header from disk and validates
      // that its cwd realpaths to the workspace path on THIS machine.
      if (sourceRegistryForAttach) {
        const registry = ctx.get('workspaceRegistry');
        if (registry !== undefined) {
          const srcWorkspaces = (sourceRegistryForAttach.tables && sourceRegistryForAttach.tables.workspaces) || {};
          let attachedSessions = 0;
          let attachedWorkspaces = 0;
          const attachErrors = [];
          for (const rec of Object.values(srcWorkspaces)) {
            if (!rec || !rec.path || !Array.isArray(rec.sessionIds) || rec.sessionIds.length === 0) continue;
            if (!existsSync(rec.path)) continue; // missing folder → cannot claim its sessions
            let entity = null;
            try {
              entity = await registry.create(rec.path, rec.title);
              attachedWorkspaces++;
            } catch (e) {
              attachErrors.push(`create(${rec.path}): ` + String((e && e.message) || e).slice(0, 140));
              continue;
            }
            for (const sid of rec.sessionIds) {
              try {
                // Already accounted sessions are skipped WITHOUT touching the
                // service: attachSession no-ops via the unchanged sentinel, but
                // any registry write would rewrite the whole state file from
                // memory and resurrect archive entries we just cleared.
                if (entity.sessionIds.includes(sid)) continue;
                await entity.attachSession(sid);
                attachedSessions++;
              } catch (e) {
                attachErrors.push(`attach(${sid}): ` + String((e && e.message) || e).slice(0, 140));
              }
            }
          }
          if (attachedSessions > 0 || attachedWorkspaces > 0 || attachErrors.length > 0) {
            restored.liveAttachedSessions = attachedSessions;
            restored.liveAttachedWorkspaces = attachedWorkspaces;
            if (attachErrors.length > 0) restored.attachErrors = attachErrors.slice(0, 5);
          }
        }
      }
    } finally {
      if (tempDir) {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch (e) { /* skip */ }
      }
    }

    return { success: true, importPath, restored, skipped };
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(String(chunk));
    return chunks.join('') || '{}';
  }

  // Default paths for the settings UI (the browser has no process.env).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api-export/defaults',
    handler: async (req, res) => {
      const dshHome = getDshHome();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        dshHome,
        exportsDir: join(dshHome, 'exports'),
        platform: process.platform
      }));
    }
  }), 'dsh-harness-exporter: /api-export/defaults');

  // Import from an uploaded zip: the browser cannot hand out full file paths,
  // so the client reads the file bytes and posts them as base64.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api-export/import-upload',
    handler: async (req, res) => {
      let tempZip = null;
      try {
        const body = JSON.parse(await readBody(req));
        const data = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
        if (!data) throw new Error('缺少文件内容（dataBase64）');
        const name = String(body.name || 'import.zip');
        if (!name.toLowerCase().endsWith('.zip')) throw new Error('仅支持 .zip 文件');
        const exportsDir = join(getDshHome(), 'exports');
        mkdirSync(exportsDir, { recursive: true });
        tempZip = join(exportsDir, '.upload-' + Date.now() + '.zip');
        writeFileSync(tempZip, Buffer.from(data, 'base64'));
        const result = await doImport(tempZip);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      } finally {
        if (tempZip) {
          try { rmSync(tempZip, { force: true }); } catch (e) { /* skip */ }
        }
      }
    }
  }), 'dsh-harness-exporter: /api-export/import-upload');

  // Register HTTP API endpoints
  // 获取会话列表（用于 UI 选择器）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api-export/sessions',
    handler: async (req, res) => {
      try {
        const dshHome = getDshHome();
        const sessions = collectSessions(dshHome);
        // 按工作区分组
        const byWorkspace = {};
        for (const s of sessions) {
          if (!byWorkspace[s.workspace]) byWorkspace[s.workspace] = [];
          byWorkspace[s.workspace].push({
            id: s.id,
            title: s.title,
            fileCount: s.files.length,
            totalSize: s.files.reduce((sum, f) => sum + f.size, 0)
          });
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ workspaces: byWorkspace }));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      }
    }
  }), 'dsh-harness-exporter: /api-export/sessions');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api-export/export',
    handler: async (req, res) => {
      try {
        const body = JSON.parse(await readBody(req));
        const result = await doExportAsync(body.outputDir, body.options);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      }
    }
  }), 'dsh-harness-exporter: /api-export/export');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api-export/import',
    handler: async (req, res) => {
      try {
        const body = JSON.parse(await readBody(req));
        const result = await doImport(body.importPath);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      }
    }
  }), 'dsh-harness-exporter: /api-export/import');

  // Register tool for agent - without using defineTool.
  // This dsh version requires every tool to declare output { schema, render }:
  // a missing output throws during register() and would fail the whole plugin
  // fiber (killing the HTTP routes and the client settings section with it),
  // so the registration is both compliant and failure-isolated here.
  ctx.effect(() => {
    try {
      ctx.tools.register({
        name: 'export_harness',
        description: '将 DSH 配置、预设和会话导出到指定目录（支持选择性导出）',
        parameters: {
          type: 'object',
          properties: {
            outputDir: { type: 'string', description: '输出目录（默认：$DSH_HOME/exports）' },
            configs: { type: 'boolean', description: '导出配置文件（未指定则导出）' },
            presets: { type: 'boolean', description: '导出 Agent 预设（未指定则导出）' },
            sessions: { type: 'boolean', description: '导出会话数据（未指定则导出）' },
            sessionIds: { type: 'array', items: { type: 'string' }, description: '指定要导出的会话ID列表（未指定则导出全部）' }
          },
          additionalProperties: false
        },
        output: {
          schema: { type: 'object' },
          render(args, value) {
            const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            return [{ type: 'text', text }];
          }
        },
        execute: async (args) => {
          const a = args || {};
          const sel = { configs: a.configs, presets: a.presets, sessions: a.sessions };
          const any = Object.values(sel).some(function(v) { return v !== undefined; });
          const options = any ? sel : undefined;
          // 会话ID过滤
          if (a.sessionIds && a.sessionIds.length > 0) {
            return doExportAsync(a.outputDir, { ...options, sessionIds: a.sessionIds });
          }
          return doExportAsync(a.outputDir, options);
        }
      });
    } catch (e) {
      // Tool registration is optional; the settings UI and HTTP endpoints must
      // survive any future tools-API mismatch.
      try { ctx.logger?.warn?.('dsh-harness-exporter: tool registration skipped:', e?.message || e); } catch (e2) { /* ignore */ }
    }
  }, 'dsh-harness-exporter: export_harness tool');
}

export { apply, inject, name };
