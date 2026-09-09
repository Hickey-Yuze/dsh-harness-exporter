/**
 * DSH Harness Exporter - Host half
 * Exports all DSH configuration files, plugins, agent presets, and sessions
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const name = 'dsh-harness-exporter';
const inject = ['webServer', 'tools'];

function apply(ctx) {
  const inspector = ctx.get('inspector');
  const agentPresets = ctx.get('agentPresets');

  function getDshHome() {
    return process.env.DSH_HOME || join(homedir(), '.dsh');
  }

  function collectConfigFiles(dshHome) {
    const result = [];
    const paths = [
      { rel: 'profiles/web/cordis.yml', label: 'Cordis 根配置' },
      { rel: 'profiles/web/cordis.patch.yml', label: 'Cordis 补丁配置' },
      { rel: 'profiles/web/package.json', label: 'Profile 包配置' },
      { rel: 'profiles/web/pnpm-lock.yaml', label: 'PNPM 锁定文件' },
      { rel: 'settings.yaml', label: '设置' },
      { rel: 'storages/workspace.json', label: '工作区注册表' }
    ];

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

  function collectPlugins() {
    const plugins = [];
    try {
      if (inspector && inspector.cordis && typeof inspector.cordis.listPlugins === 'function') {
        const list = inspector.cordis.listPlugins();
        for (const p of list) {
          plugins.push({
            id: p.id,
            name: p.name || p.id,
            status: p.status || '未知'
          });
        }
      }
    } catch (e) {
      // skip
    }
    return plugins;
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
          presets.push({
            id: preset.id,
            name: preset.name || preset.id,
            composition: comp
          });
        }
      }
    } catch (e) {
      // skip
    }
    return presets;
  }

  function collectSessions(dshHome) {
    const sessions = [];
    const sdir = join(dshHome, 'sessions');
    try {
      if (!existsSync(sdir)) return sessions;
      const wsDirs = readdirSync(sdir);
      for (const ws of wsDirs) {
        if (ws.startsWith('.')) continue;
        const wsPath = join(sdir, ws);
        try {
          const wsStat = statSync(wsPath);
          if (!wsStat.isDirectory()) continue;
          const sDirs = readdirSync(wsPath);
          for (const sd of sDirs) {
            if (!sd.startsWith('session-')) continue;
            const sp = join(wsPath, sd);
            try {
              const spStat = statSync(sp);
              if (!spStat.isDirectory()) continue;
              const files = readdirSync(sp);
              sessions.push({
                id: sd,
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

    const opts = options || { configs: true, plugins: true, presets: true, sessions: true };

    const cfgs = opts.configs ? collectConfigFiles(dshHome) : [];
    const plugs = opts.plugins ? collectPlugins() : [];
    const prsts = opts.presets ? await collectPresets() : [];
    const sess = opts.sessions ? collectSessions(dshHome) : [];

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = 'dsh-export-' + ts;
    const staging = join(outputDir, archiveName);

    // Create staging directories
    const dirs = [
      join(staging, 'configs'),
      join(staging, 'plugins'),
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

    // Write plugin manifest
    try { writeFileSync(join(staging, 'plugins', 'manifest.json'), JSON.stringify(plugs, null, 2), 'utf-8'); } catch (e) { /* skip */ }

    // Write presets
    for (const prst of prsts) {
      const sn = prst.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      try { writeFileSync(join(staging, 'presets', sn + '.yml'), prst.composition, 'utf-8'); } catch (e) { /* skip */ }
    }

    // Write session manifest
    const sm = sess.map(s => ({
      id: s.id, workspace: s.workspace,
      files: s.files.map(f => ({ name: f.name, size: f.size }))
    }));
    try { writeFileSync(join(staging, 'sessions', 'manifest.json'), JSON.stringify(sm, null, 2), 'utf-8'); } catch (e) { /* skip */ }

    // Copy session files
    for (const s of sess) {
      for (const f of s.files) {
        const dd = join(staging, 'sessions', s.id);
        try {
          mkdirSync(dd, { recursive: true });
          const content = readFileSync(f.path, 'utf-8');
          writeFileSync(join(dd, f.name), content, 'utf-8');
        } catch (e) { /* skip */ }
      }
    }

    // Write summary
    const summary = {
      exportedAt: new Date().toISOString(),
      dshHome,
      configFiles: cfgs.length,
      plugins: plugs.length,
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
      plugins: plugs,
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

    const restored = { configs: 0, presets: 0, sessions: 0 };

    try {
      // Restore config files
      const configsDir = join(actualImportPath, 'configs');
      if (existsSync(configsDir)) {
        const configFiles = readdirSync(configsDir);
        for (const f of configFiles) {
          if (f === '.keep') continue;
          try {
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

      // Restore presets
      const presetsDir = join(actualImportPath, 'presets');
      if (existsSync(presetsDir)) {
        const presetFiles = readdirSync(presetsDir);
        const presetsStoreDir = join(dshHome, 'agent-presets');
        mkdirSync(presetsStoreDir, { recursive: true });
        for (const f of presetFiles) {
          if (f === '.keep' || !f.endsWith('.yml')) continue;
          try {
            const content = readFileSync(join(presetsDir, f), 'utf-8');
            const presetId = f.replace(/\.yml$/, '').replace(/_/g, '-');
            writeFileSync(join(presetsStoreDir, presetId + '.yml'), content, 'utf-8');
            restored.presets++;
          } catch (e) { /* skip */ }
        }
      }

      // Restore sessions
      const sessionsDir = join(actualImportPath, 'sessions');
      if (existsSync(sessionsDir)) {
        const sessionDirs = readdirSync(sessionsDir);
        for (const sd of sessionDirs) {
          if (sd === '.keep' || sd === 'manifest.json') continue;
          const sessPath = join(sessionsDir, sd);
          try {
            if (!statSync(sessPath).isDirectory()) continue;
            const dstSessPath = join(dshHome, 'sessions', 'default', sd);
            mkdirSync(dstSessPath, { recursive: true });
            const files = readdirSync(sessPath);
            for (const f of files) {
              if (f === '.keep') continue;
              try {
                const content = readFileSync(join(sessPath, f), 'utf-8');
                writeFileSync(join(dstSessPath, f), content, 'utf-8');
              } catch (e) { /* skip */ }
            }
            restored.sessions++;
          } catch (e) { /* skip */ }
        }
      }
    } finally {
      if (tempDir) {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch (e) { /* skip */ }
      }
    }

    return { success: true, importPath, restored };
  }

  // Register HTTP API endpoints
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api-export/export',
    handler: async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(String(chunk));
        const body = JSON.parse(chunks.join('') || '{}');
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
        const chunks = [];
        for await (const chunk of req) chunks.push(String(chunk));
        const body = JSON.parse(chunks.join('') || '{}');
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
        description: '将 DSH 配置、插件、预设和会话导出到指定目录（支持选择性导出）',
        parameters: {
          type: 'object',
          properties: {
            outputDir: { type: 'string', description: '输出目录（默认：$DSH_HOME/exports）' },
            configs: { type: 'boolean', description: '导出配置文件（未指定则导出）' },
            plugins: { type: 'boolean', description: '导出插件清单（未指定则导出）' },
            presets: { type: 'boolean', description: '导出 Agent 预设（未指定则导出）' },
            sessions: { type: 'boolean', description: '导出会话数据（未指定则导出）' }
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
          const sel = { configs: a.configs, plugins: a.plugins, presets: a.presets, sessions: a.sessions };
          const any = Object.values(sel).some(function(v) { return v !== undefined; });
          return doExportAsync(a.outputDir, any ? sel : undefined);
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
