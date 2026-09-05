/**
 * DSH Harness Exporter - Host half
 * Exports all DSH configuration files, plugins, agent presets, and sessions
 */

import { defineTool } from '@deepseek-ai/dsh-tools';

const name = 'dsh-harness-exporter';
const inject = ['fs', 'tools'];

function apply(ctx) {
    const fsService = ctx.fs;
    const inspector = ctx.get('inspector');
    const agentPresets = ctx.get('agentPresets');

    function getDshHome() {
      return process.env.DSH_HOME || (process.env.HOME + '/.dsh');
    }

    async function collectConfigFiles(dshHome) {
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
          const target = await fsService.resolve(dshHome + '/' + entry.rel);
          const info = await fsService.stat(target);
          if (info && info.type === 'file') {
            const content = await fsService.readText(target);
            result.push({ path: entry.rel, label: entry.label, content: content, size: info.size });
          }
        } catch (e) {
          // skip
        }
      }
      return result;
    }

    async function collectPlugins() {
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

    async function collectSessions(dshHome) {
      const sessions = [];
      const sdir = dshHome + '/sessions';
      try {
        const sdirTarget = await fsService.resolve(sdir);
        const wsDirs = await fsService.listDir(sdirTarget);
        for (const ws of wsDirs) {
          if (ws.name.startsWith('.')) continue;
          const wsPath = sdir + '/' + ws.name;
          try {
            const wsTarget = await fsService.resolve(wsPath);
            const sDirs = await fsService.listDir(wsTarget);
            for (const sd of sDirs) {
              if (!sd.name.startsWith('session-')) continue;
              const sp = wsPath + '/' + sd.name;
              try {
                const spTarget = await fsService.resolve(sp);
                const files = await fsService.listDir(spTarget);
                sessions.push({
                  id: sd.name,
                  workspace: ws.name,
                  path: sp,
                  files: files.map(f => ({
                    name: f.name,
                    size: f.size || 0,
                    path: sp + '/' + f.name
                  }))
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

    async function doExport(outputDir, options) {
      const dshHome = getDshHome();
      if (!outputDir) outputDir = dshHome + '/exports';

      // Default options: export everything
      const opts = options || { configs: true, plugins: true, presets: true, sessions: true };

      const cfgs = opts.configs ? await collectConfigFiles(dshHome) : [];
      const plugs = opts.plugins ? await collectPlugins() : [];
      const prsts = opts.presets ? await collectPresets() : [];
      const sess = opts.sessions ? await collectSessions(dshHome) : [];

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const archiveName = 'dsh-export-' + ts;
      const staging = outputDir + '/' + archiveName;
      const archivePath = outputDir + '/' + archiveName + '.zip';

      // Create staging directories
      const dirs = [
        staging + '/configs',
        staging + '/plugins',
        staging + '/presets',
        staging + '/sessions'
      ];
      for (const dir of dirs) {
        try {
          const dirTarget = await fsService.resolve(dir);
          await fsService.writeText(dirTarget + '/.keep', '');
        } catch (e) {
          // skip
        }
      }

      // Write config files
      for (const cfg of cfgs) {
        const sn = cfg.path.replace(/\//g, '_');
        try {
          const target = await fsService.resolve(staging + '/configs/' + sn);
          await fsService.writeText(target, cfg.content);
        } catch (e) {
          // skip
        }
      }

      // Write plugin manifest
      try {
        const target = await fsService.resolve(staging + '/plugins/manifest.json');
        await fsService.writeText(target, JSON.stringify(plugs, null, 2));
      } catch (e) {
        // skip
      }

      // Write presets
      for (const prst of prsts) {
        const sn = prst.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        try {
          const target = await fsService.resolve(staging + '/presets/' + sn + '.yml');
          await fsService.writeText(target, prst.composition);
        } catch (e) {
          // skip
        }
      }

      // Write session manifest
      const sm = sess.map(s => ({
        id: s.id,
        workspace: s.workspace,
        files: s.files.map(f => ({ name: f.name, size: f.size }))
      }));
      try {
        const target = await fsService.resolve(staging + '/sessions/manifest.json');
        await fsService.writeText(target, JSON.stringify(sm, null, 2));
      } catch (e) {
        // skip
      }

      // Copy session files
      for (const s of sess) {
        for (const f of s.files) {
          const dd = staging + '/sessions/' + s.id;
          try {
            const srcTarget = await fsService.resolve(f.path);
            const content = await fsService.readText(srcTarget);
            const dstTarget = await fsService.resolve(dd + '/' + f.name);
            await fsService.writeText(dstTarget, content);
          } catch (e) {
            // skip
          }
        }
      }

      // Write summary
      const summary = {
        exportedAt: new Date().toISOString(),
        dshHome: dshHome,
        configFiles: cfgs.length,
        plugins: plugs.length,
        presets: prsts.length,
        sessions: sess.length
      };
      try {
        const target = await fsService.resolve(staging + '/export-summary.json');
        await fsService.writeText(target, JSON.stringify(summary, null, 2));
      } catch (e) {
        // skip
      }

      // Create zip archive
      try {
        const shell = ctx.get('shell');
        if (shell && typeof shell.run === 'function') {
          await shell.run({
            command: 'cd "' + outputDir + '" && zip -r "' + archiveName + '.zip" "' + archiveName + '"'
          });
        }
      } catch (e) {
        // skip - archive creation is optional
      }

      // Cleanup staging directory
      try {
        const stagingTarget = await fsService.resolve(staging);
        const shell = ctx.get('shell');
        if (shell && typeof shell.run === 'function') {
          await shell.run({ command: 'rm -rf "' + staging + '"' });
        }
      } catch (e) {
        // skip
      }

      return {
        success: true,
        archivePath: archivePath,
        archiveName: archiveName + '.zip',
        summary: summary,
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

      // Check if import path is a zip file
      if (importPath.endsWith('.zip')) {
        // Extract to temporary directory
        const ts = new Date().getTime();
        tempDir = dshHome + '/exports/.import-temp-' + ts;
        
        try {
          const shell = ctx.get('shell');
          if (shell && typeof shell.run === 'function') {
            // Create temp directory
            await shell.run({ command: 'mkdir -p "' + tempDir + '"' });
            // Extract zip
            await shell.run({ command: 'unzip -o "' + importPath + '" -d "' + tempDir + '"' });
            // Find the extracted directory (should be the only directory in tempDir)
            const tempDirTarget = await fsService.resolve(tempDir);
            const entries = await fsService.listDir(tempDirTarget);
            if (entries.length > 0 && entries[0].type === 'directory') {
              actualImportPath = tempDir + '/' + entries[0].name;
            } else {
              actualImportPath = tempDir;
            }
          } else {
            throw new Error('无法解压文件：shell 服务不可用');
          }
        } catch (e) {
          throw new Error('解压失败：' + (e.message || String(e)));
        }
      } else {
        // Verify import path exists and is a directory
        const importTarget = await fsService.resolve(importPath);
        const importInfo = await fsService.stat(importTarget);
        if (!importInfo || importInfo.type !== 'directory') {
          throw new Error('导入路径不存在或不是目录：' + importPath);
        }
      }

      const restored = {
        configs: 0,
        presets: 0,
        sessions: 0
      };

      try {
        // Restore config files
        const configsDir = actualImportPath + '/configs';
        try {
          const configsTarget = await fsService.resolve(configsDir);
          const configFiles = await fsService.listDir(configsTarget);
          for (const f of configFiles) {
            if (f.name === '.keep') continue;
            const srcPath = configsDir + '/' + f.name;
            const srcTarget = await fsService.resolve(srcPath);
            const content = await fsService.readText(srcTarget);
            
            // Restore original path (reverse the sanitization)
            const origPath = f.name.replace(/_/g, '/');
            const dstPath = dshHome + '/' + origPath;
            try {
              const dstTarget = await fsService.resolve(dstPath);
              await fsService.writeText(dstTarget, content);
              restored.configs++;
            } catch (e) {
              // skip
            }
          }
        } catch (e) {
          // skip
        }

        // Restore presets
        const presetsDir = actualImportPath + '/presets';
        try {
          const presetsTarget = await fsService.resolve(presetsDir);
          const presetFiles = await fsService.listDir(presetsTarget);
          for (const f of presetFiles) {
            if (f.name === '.keep' || !f.name.endsWith('.yml')) continue;
            const srcPath = presetsDir + '/' + f.name;
            const srcTarget = await fsService.resolve(srcPath);
            const content = await fsService.readText(srcTarget);
            
            // Restore preset ID (reverse the sanitization)
            const presetId = f.name.replace(/\.yml$/, '').replace(/_/g, '-');
            
            // Write preset to agent-presets directory
            const presetsStoreDir = dshHome + '/agent-presets';
            try {
              const storeDirTarget = await fsService.resolve(presetsStoreDir);
              await fsService.writeText(storeDirTarget + '/.keep', '');
              const presetFile = presetsStoreDir + '/' + presetId + '.yml';
              const presetFileTarget = await fsService.resolve(presetFile);
              await fsService.writeText(presetFileTarget, content);
              restored.presets++;
            } catch (e) {
              // skip
            }
          }
        } catch (e) {
          // skip
        }

        // Restore sessions
        const sessionsDir = actualImportPath + '/sessions';
        try {
          const sessionsTarget = await fsService.resolve(sessionsDir);
          const sessionDirs = await fsService.listDir(sessionsTarget);
          for (const sd of sessionDirs) {
            if (sd.name === '.keep') continue;
            const sessId = sd.name;
            const sessPath = sessionsDir + '/' + sessId;
            try {
              const sessTarget = await fsService.resolve(sessPath);
              const files = await fsService.listDir(sessTarget);
              
              // Create session directory in DSH home
              const dstSessPath = dshHome + '/sessions/default/' + sessId;
              try {
                const dstSessTarget = await fsService.resolve(dstSessPath);
                await fsService.writeText(dstSessTarget + '/.keep', '');
              } catch (e) {
                // skip
              }
              
              for (const f of files) {
                if (f.name === '.keep') continue;
                const srcFile = sessPath + '/' + f.name;
                const srcFileTarget = await fsService.resolve(srcFile);
                const content = await fsService.readText(srcFileTarget);
                const dstFile = dstSessPath + '/' + f.name;
                try {
                  const dstFileTarget = await fsService.resolve(dstFile);
                  await fsService.writeText(dstFileTarget, content);
                } catch (e) {
                  // skip
                }
              }
              restored.sessions++;
            } catch (e) {
              // skip
            }
          }
        } catch (e) {
          // skip
        }
      } finally {
        // Cleanup temp directory if created
        if (tempDir) {
          try {
            const shell = ctx.get('shell');
            if (shell && typeof shell.run === 'function') {
              await shell.run({ command: 'rm -rf "' + tempDir + '"' });
            }
          } catch (e) {
            // skip
          }
        }
      }

      return {
        success: true,
        importPath: importPath,
        restored: restored
      };
    }

    // Register HTTP API endpoint for client GUI
    ctx.inject(['webServer'], (webCtx) => {
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api-export/export',
        handler: async (req, res) => {
          try {
            // Read request body
            const chunks = [];
            for await (const chunk of req) chunks.push(String(chunk));
            const body = JSON.parse(chunks.join('') || '{}');
            const result = await doExport(body.outputDir, body.options);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: e.message || String(e) }));
          }
        }
      });

      webCtx.webServer.register({
        kind: 'exact',
        path: '/api-export/import',
        handler: async (req, res) => {
          try {
            // Read request body
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
      });
    });

    // Register tool for agent
    const removeTool = ctx.tools.register(defineTool({
      name: 'export_harness',
      description: '将 DSH 配置、插件、预设和会话导出到指定目录（支持选择性导出）',
      parameters: {
        outputDir: { type: 'string', description: '输出目录（默认：$DSH_HOME/exports）' },
        configs: { type: 'boolean', description: '导出配置文件（未指定则导出）' },
        plugins: { type: 'boolean', description: '导出插件清单（未指定则导出）' },
        presets: { type: 'boolean', description: '导出 Agent 预设（未指定则导出）' },
        sessions: { type: 'boolean', description: '导出会话数据（未指定则导出）' },
        additionalProperties: false
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            success: { type: 'boolean' },
            archivePath: { type: 'string' },
            archiveName: { type: 'string' },
            summary: { type: 'object', additionalProperties: true },
            configFiles: { type: 'array', items: { type: 'object', additionalProperties: true } },
            plugins: { type: 'array', items: { type: 'string' } },
            presets: { type: 'array', items: { type: 'object', additionalProperties: true } },
            sessions: { type: 'array', items: { type: 'object', additionalProperties: true } },
            error: { type: 'string' }
          }
        },
        render: function(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
        }
      },
      execute: function(args, _exec) {
        const a = args || {};
        const sel = { configs: a.configs, plugins: a.plugins, presets: a.presets, sessions: a.sessions };
        const any = Object.values(sel).some(function(v) { return v !== undefined; });
        return doExport(a.outputDir, any ? sel : undefined);
      }
    }));

    ctx.effect(function() {
      removeTool();
    });
  }

export { apply, inject, name };
