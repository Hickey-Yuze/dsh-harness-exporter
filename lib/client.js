window.__ModuleLoader__.load({
	id: "dsh-harness-exporter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { createElement: h, useState, useEffect, useRef } = React;

		const LOCALE_NS = "harness-exporter";
		const DICT = {
			zh: {
				"settings.tab": "导出配置",
				"export.title": "导出 DSH 配置",
				"export.desc": "将 DSH 配置文件、插件、Agent 预设和会话导出为压缩包",
				"export.selectPath": "选择导出路径",
				"export.pathPlaceholder": "输入导出目录路径...",
				"export.useDefault": "使用默认路径",
				"export.options": "导出选项",
				"export.configs": "配置文件",
				"export.configsDesc": "cordis.yml、package.json、settings.yaml 等",
				"export.plugins": "插件清单",
				"export.pluginsDesc": "已安装插件列表",
				"export.presets": "Agent 预设",
				"export.presetsDesc": "自定义 Agent 预设配置",
				"export.sessions": "会话数据",
				"export.sessionsDesc": "所有会话记录",
				"export.submit": "开始导出",
				"export.exporting": "导出中...",
				"export.success": "导出成功",
				"export.successPath": "导出到：",
				"export.error": "导出失败",
				"import.title": "导入 DSH 配置",
				"import.desc": "从之前导出的压缩包恢复 DSH 配置",
				"import.selectPath": "选择压缩包文件",
				"import.pathPlaceholder": "输入 zip 压缩包路径或点击下方按钮选择...",
				"import.browse": "选择 zip 文件...",
				"import.submit": "开始导入",
				"import.importing": "导入中...",
				"import.success": "导入成功",
				"import.successMsg": "已恢复配置，请重启 DSH 使更改生效",
				"import.error": "导入失败",
				"common.restart": "请重启 DSH 使更改生效",
			},
			en: {
				"settings.tab": "Export Config",
				"export.title": "Export DSH Configuration",
				"export.desc": "Export DSH config files, plugins, agent presets, and sessions as archive",
				"export.selectPath": "Select Export Path",
				"export.pathPlaceholder": "Enter export directory path...",
				"export.useDefault": "Use Default Path",
				"export.browseFolder": "Browse Folder",
				"export.options": "Export Options",
				"export.configs": "Config Files",
				"export.configsDesc": "cordis.yml, package.json, settings.yaml, etc.",
				"export.plugins": "Plugin Manifest",
				"export.pluginsDesc": "List of installed plugins",
				"export.presets": "Agent Presets",
				"export.presetsDesc": "Custom agent preset configurations",
				"export.sessions": "Session Data",
				"export.sessionsDesc": "All session records",
				"export.submit": "Start Export",
				"export.exporting": "Exporting...",
				"export.success": "Export Successful",
				"export.successPath": "Exported to:",
				"export.error": "Export Failed",
				"import.title": "Import DSH Configuration",
				"import.desc": "Restore DSH configuration from a previous export archive",
				"import.selectPath": "Select Archive File",
				"import.pathPlaceholder": "Enter archive path or click button to select...",
				"import.browse": "Select File...",
				"import.submit": "Start Import",
				"import.importing": "Importing...",
				"import.success": "Import Successful",
				"import.successMsg": "Configuration restored. Please restart DSH for changes to take effect.",
				"import.error": "Import Failed",
				"common.restart": "Please restart DSH for changes to take effect.",
			},
		};

		function ExportImportSettingsSection(props) {
			const t = (key) => DICT.zh[key] || key;
			const importFileRef = useRef(null);
			const exportFolderRef = useRef(null);

			const [exportPath, setExportPath] = useState("");
			const [exportOptions, setExportOptions] = useState({
				configs: true,
				plugins: true,
				presets: true,
				sessions: true,
			});
			const [exportStatus, setExportStatus] = useState("idle");
			const [exportResult, setExportResult] = useState(null);
			const [exportError, setExportError] = useState(null);

			const [importPath, setImportPath] = useState("");
			const [importStatus, setImportStatus] = useState("idle");
			const [importResult, setImportResult] = useState(null);
			const [importError, setImportError] = useState(null);

			const doExport = async () => {
				if (!exportPath.trim()) {
					setExportError("请输入导出路径");
					return;
				}
				setExportStatus("exporting");
				setExportResult(null);
				setExportError(null);
				try {
					const res = await fetch("/api-export/export", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							outputDir: exportPath.trim(),
							options: exportOptions,
						}),
					});
					const data = await res.json();
					if (data.error) throw new Error(data.error);
					setExportResult(data);
					setExportStatus("done");
				} catch (e) {
					setExportError(e.message || "导出失败");
					setExportStatus("error");
				}
			};

			const doImport = async () => {
				if (!importPath.trim()) {
					setImportError("请选择导入路径");
					return;
				}
				setImportStatus("importing");
				setImportResult(null);
				setImportError(null);
				try {
					const res = await fetch("/api-export/import", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ importPath: importPath.trim() }),
					});
					const data = await res.json();
					if (data.error) throw new Error(data.error);
					setImportResult(data);
					setImportStatus("done");
				} catch (e) {
					setImportError(e.message || "导入失败");
					setImportStatus("error");
				}
			};

			const handleImportFileSelect = (e) => {
				const files = e.target.files;
				if (files && files.length > 0) {
					const file = files[0];
					// For security reasons, browsers don't expose full path
					// We'll use the file name and let the user know they need to provide full path
					// Or we can try to use webkitRelativePath if available
					if (file.webkitRelativePath) {
						setImportPath(file.webkitRelativePath);
					} else {
						// Show a message that user needs to provide full path
						alert('由于浏览器安全限制，请选择文件后手动输入完整路径，或将文件放到默认导出目录中。\n\n默认导出目录：~/Library/Application Support/com.yuze.harness/dsh/exports/');
						setImportPath(file.name);
					}
				}
			};

			const handleExportFolderSelect = (e) => {
				const files = e.target.files;
				if (files && files.length > 0) {
					const file = files[0];
					// webkitRelativePath gives us "folder/subfolder/file"
					// We need to extract just the folder path
					const relativePath = file.webkitRelativePath || file.name;
					const pathParts = relativePath.split('/');
					if (pathParts.length > 1) {
						// Reconstruct the folder path
						const folderPath = pathParts.slice(0, -1).join('/');
						setExportPath(folderPath);
					} else {
						// Can't determine path, use prompt
						const path = prompt('请输入导出目录路径：', exportPath);
						if (path) setExportPath(path);
					}
				}
			};

			const sectionStyle = { padding: "16px 0" };
			const cardStyle = {
				background: "var(--dsh-surface-2, #f9fafb)",
				border: "1px solid var(--dsh-border, #e5e7eb)",
				borderRadius: "8px",
				padding: "20px",
				marginBottom: "20px",
			};
			const titleStyle = { fontSize: "16px", fontWeight: 600, marginBottom: "8px", color: "var(--dsh-text-primary, #111827)" };
			const descStyle = { fontSize: "13px", color: "var(--dsh-text-muted, #6b7280)", marginBottom: "16px" };
			const labelStyle = { display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "var(--dsh-text-primary, #374151)" };
			const inputRowStyle = { display: "flex", gap: "8px", marginBottom: "16px" };
			const inputStyle = {
				flex: 1,
				padding: "8px 12px",
				background: "var(--dsh-surface-1, #ffffff)",
				border: "1px solid var(--dsh-border, #d1d5db)",
				borderRadius: "6px",
				fontSize: "13px",
				color: "var(--dsh-text-primary, #111827)",
				outline: "none",
			};
			const btnPrimaryStyle = {
				padding: "8px 16px",
				background: "#3b82f6",
				border: "none",
				borderRadius: "6px",
				color: "#ffffff",
				fontSize: "13px",
				fontWeight: 500,
				cursor: "pointer",
				whiteSpace: "nowrap",
			};
			const btnSecondaryStyle = {
				padding: "8px 16px",
				background: "#f3f4f6",
				border: "1px solid #d1d5db",
				borderRadius: "6px",
				color: "#374151",
				fontSize: "13px",
				fontWeight: 500,
				cursor: "pointer",
				whiteSpace: "nowrap",
			};
			const btnDisabledStyle = {
				padding: "8px 16px",
				background: "#d1d5db",
				border: "none",
				borderRadius: "6px",
				color: "#9ca3af",
				fontSize: "13px",
				fontWeight: 500,
				cursor: "not-allowed",
				whiteSpace: "nowrap",
			};
			const optionRowStyle = { display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "12px" };
			const checkboxStyle = { marginTop: "2px", cursor: "pointer" };
			const optionLabelStyle = { fontSize: "13px", fontWeight: 500, color: "var(--dsh-text-primary, #374151)" };
			const optionDescStyle = { fontSize: "12px", color: "var(--dsh-text-muted, #6b7280)", marginTop: "2px" };
			const successStyle = { padding: "12px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "6px", marginTop: "12px" };
			const errorStyle = { padding: "12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "6px", marginTop: "12px", color: "#dc2626" };
			const pathStyle = { wordBreak: "break-all", fontFamily: "monospace", fontSize: "12px", marginTop: "8px", color: "#065f46" };

			return h("div", { style: sectionStyle },
				// Export Section
				h("div", { style: cardStyle },
					h("div", { style: titleStyle }, "📦 " + t("export.title")),
					h("div", { style: descStyle }, t("export.desc")),

					h("label", { style: labelStyle }, t("export.selectPath")),
					h("div", { style: inputRowStyle },
						h("input", {
							type: "text",
							style: inputStyle,
							value: exportPath,
							onChange: (e) => setExportPath(e.target.value),
							placeholder: t("export.pathPlaceholder"),
						}),
						h("button", {
							style: btnSecondaryStyle,
							onClick: () => {
								// Use default path: DSH_HOME/exports
								const defaultPath = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME) 
									? process.env.DSH_HOME + '/exports'
									: '~/Library/Application Support/com.yuze.harness/dsh/exports';
								setExportPath(defaultPath);
							},
						}, t("export.useDefault")),
						h("input", {
							ref: exportFolderRef,
							type: "file",
							webkitdirectory: "true",
							directory: "true",
							multiple: "true",
							style: { display: "none" },
							onChange: handleExportFolderSelect,
						}),
						h("button", {
							style: btnSecondaryStyle,
							onClick: () => {
								if (exportFolderRef.current) {
									exportFolderRef.current.click();
								}
							},
						}, "浏览文件夹"),
					),

					h("div", { style: { fontSize: "13px", fontWeight: 500, marginBottom: "10px", color: "var(--dsh-text-primary, #374151)" } }, t("export.options")),
					h("div", { style: optionRowStyle },
						h("input", {
							type: "checkbox",
							style: checkboxStyle,
							checked: exportOptions.configs,
							onChange: (e) => setExportOptions({ ...exportOptions, configs: e.target.checked }),
						}),
						h("div", null,
							h("div", { style: optionLabelStyle }, t("export.configs")),
							h("div", { style: optionDescStyle }, t("export.configsDesc")),
						),
					),
					h("div", { style: optionRowStyle },
						h("input", {
							type: "checkbox",
							style: checkboxStyle,
							checked: exportOptions.plugins,
							onChange: (e) => setExportOptions({ ...exportOptions, plugins: e.target.checked }),
						}),
						h("div", null,
							h("div", { style: optionLabelStyle }, t("export.plugins")),
							h("div", { style: optionDescStyle }, t("export.pluginsDesc")),
						),
					),
					h("div", { style: optionRowStyle },
						h("input", {
							type: "checkbox",
							style: checkboxStyle,
							checked: exportOptions.presets,
							onChange: (e) => setExportOptions({ ...exportOptions, presets: e.target.checked }),
						}),
						h("div", null,
							h("div", { style: optionLabelStyle }, t("export.presets")),
							h("div", { style: optionDescStyle }, t("export.presetsDesc")),
						),
					),
					h("div", { style: optionRowStyle },
						h("input", {
							type: "checkbox",
							style: checkboxStyle,
							checked: exportOptions.sessions,
							onChange: (e) => setExportOptions({ ...exportOptions, sessions: e.target.checked }),
						}),
						h("div", null,
							h("div", { style: optionLabelStyle }, t("export.sessions")),
							h("div", { style: optionDescStyle }, t("export.sessionsDesc")),
						),
					),

					h("button", {
						style: exportStatus === "exporting" ? btnDisabledStyle : btnPrimaryStyle,
						onClick: doExport,
						disabled: exportStatus === "exporting",
					}, exportStatus === "exporting" ? t("export.exporting") : t("export.submit")),

					exportStatus === "done" && exportResult ? h("div", { style: successStyle },
						h("div", { style: { fontWeight: 600 } }, "✅ " + t("export.success")),
						h("div", { style: pathStyle }, t("export.successPath") + " " + exportResult.stagingPath),
						h("div", { style: { marginTop: "8px", fontSize: "12px", color: "#065f46" } }, t("common.restart")),
					) : null,
					exportStatus === "error" && exportError ? h("div", { style: errorStyle },
						h("div", { style: { fontWeight: 600 } }, "❌ " + t("export.error")),
						h("div", { style: { marginTop: "4px" } }, exportError),
					) : null,
				),

				// Import Section
				h("div", { style: cardStyle },
					h("div", { style: titleStyle }, "📥 " + t("import.title")),
					h("div", { style: descStyle }, t("import.desc")),

					h("label", { style: labelStyle }, t("import.selectPath")),
					h("div", { style: inputRowStyle },
						h("input", {
							type: "text",
							style: inputStyle,
							value: importPath,
							onChange: (e) => setImportPath(e.target.value),
							placeholder: t("import.pathPlaceholder"),
						}),
						h("input", {
							ref: importFileRef,
							type: "file",
							accept: ".zip",
							style: { display: "none" },
							onChange: handleImportFileSelect,
						}),
						h("button", {
							style: btnSecondaryStyle,
							onClick: () => {
								if (importFileRef.current) {
									importFileRef.current.click();
								}
							},
						}, t("import.browse")),
					),

					h("button", {
						style: importStatus === "importing" ? btnDisabledStyle : btnPrimaryStyle,
						onClick: doImport,
						disabled: importStatus === "importing",
					}, importStatus === "importing" ? t("import.importing") : t("import.submit")),

					importStatus === "done" && importResult ? h("div", { style: successStyle },
						h("div", { style: { fontWeight: 600 } }, "✅ " + t("import.success")),
						h("div", { style: { marginTop: "8px", fontSize: "13px" } },
							"配置文件：" + importResult.restored.configs + " | " +
							"Agent 预设：" + importResult.restored.presets + " | " +
							"会话：" + importResult.restored.sessions,
						),
						h("div", { style: { marginTop: "8px", fontSize: "12px", color: "#065f46" } }, t("common.restart")),
					) : null,
					importStatus === "error" && importError ? h("div", { style: errorStyle },
						h("div", { style: { fontWeight: 600 } }, "❌ " + t("import.error")),
						h("div", { style: { marginTop: "4px" } }, importError),
					) : null,
				),
			);
		}

		const name = "dsh-harness-exporter";
		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () => {
				return ctx.slots.register({
					name: "settings.section",
					id: "harness-exporter",
					order: 25,
					label: () => DICT.zh["settings.tab"],
					locale: LOCALE_NS,
					inject: () => ({}),
				}, ExportImportSettingsSection);
			});
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
