window.__ModuleLoader__.load({
	id: "dsh-harness-exporter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const ReactMod = require("react");
		const React = (ReactMod && ReactMod.default) ? ReactMod.default : ReactMod;
		const { createElement: h, useState, useRef } = React;

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
		};

		function ExportImportSettingsSection() {
			const t = (key) => DICT.zh[key] || key;
			const importFileRef = useRef(null);

			const [exportPath, setExportPath] = useState("");
			const [exportOptions, setExportOptions] = useState({
				configs: true,
				presets: true,
				sessions: false,
			});
			const [availableSessions, setAvailableSessions] = useState(null);
			const [selectedSessionIds, setSelectedSessionIds] = useState([]);
			const [exportStatus, setExportStatus] = useState("idle");
			const [exportResult, setExportResult] = useState(null);
			const [exportError, setExportError] = useState(null);

			const [importPath, setImportPath] = useState("");
			const [importFile, setImportFile] = useState(null);
			const [importStatus, setImportStatus] = useState("idle");
			const [importResult, setImportResult] = useState(null);
			const [importError, setImportError] = useState(null);

			// The renderer has no process.env; ask the host for default paths.
			const applyDefaultPath = async () => {
				try {
					const res = await fetch("/api-export/defaults");
					const data = await res.json();
					if (data.exportsDir) {
						setExportPath(data.exportsDir);
						setExportError(null);
					} else {
						setExportError(data.error || "无法获取默认路径");
					}
				} catch (e) {
					setExportError("无法获取默认路径：" + (e.message || e));
				}
			};

			// Native Windows directory picker provided by the desktop shell.
			const browseExportDir = async () => {
				const pick = typeof window !== "undefined" ? window.__DSH_DESKTOP_PICK_DIRECTORY__ : null;
				if (typeof pick !== "function") {
					setExportError("当前环境没有原生文件夹选择器，请手动输入路径");
					return;
				}
				try {
					const dir = await pick();
					if (dir) {
						setExportPath(dir);
						setExportError(null);
					}
				} catch (e) {
					// user cancelled the dialog — ignore silently
				}
			};

			function fileToBase64(file) {
				return new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => {
						const buf = new Uint8Array(reader.result);
						let binary = "";
						const chunkSize = 0x8000;
						for (let i = 0; i < buf.length; i += chunkSize) {
							binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunkSize));
						}
						resolve(btoa(binary));
					};
					reader.onerror = () => reject(new Error("读取文件失败"));
					reader.readAsArrayBuffer(file);
				});
			}

			const doExport = async () => {
				if (!exportPath.trim()) {
					setExportError("请输入导出路径，或点击「使用默认路径」");
					return;
				}
				setExportStatus("exporting");
				setExportResult(null);
				setExportError(null);
				try {
					const body = {
						outputDir: exportPath.trim(),
						options: exportOptions,
					};
					// 如果选择了特定会话
					if (exportOptions.sessions && selectedSessionIds.length > 0) {
						body.options = { ...exportOptions, sessionIds: selectedSessionIds };
					}
					const res = await fetch("/api-export/export", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
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

			// 获取可用会话列表
			const loadSessions = async () => {
				try {
					const res = await fetch("/api-export/sessions");
					const data = await res.json();
					if (data.error) throw new Error(data.error);
					setAvailableSessions(data.workspaces);
				} catch (e) {
					console.error("加载会话列表失败:", e);
				}
			};

			const doImport = async () => {
				if (importFile) {
					// Uploaded zip: read the bytes and post them (the browser
					// cannot provide the file's full path).
					setImportStatus("importing");
					setImportResult(null);
					setImportError(null);
					try {
						const dataBase64 = await fileToBase64(importFile);
						const res = await fetch("/api-export/import-upload", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ name: importFile.name, dataBase64 }),
						});
						const data = await res.json();
						if (data.error) throw new Error(data.error);
						setImportResult(data);
						setImportStatus("done");
					} catch (e) {
						setImportError(e.message || "导入失败");
						setImportStatus("error");
					}
					return;
				}
				if (!importPath.trim()) {
					setImportError("请选择 zip 文件，或输入其完整路径");
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
					setImportFile(file);
					setImportPath(file.name);
					setImportError(null);
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
							onClick: applyDefaultPath,
						}, t("export.useDefault")),
						h("button", {
							style: btnSecondaryStyle,
							onClick: browseExportDir,
						}, "浏览..."),
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
							onChange: (e) => {
								setExportOptions({ ...exportOptions, sessions: e.target.checked });
								// 勾选时加载会话列表
								if (e.target.checked && !availableSessions) {
									loadSessions();
								}
							},
						}),
						h("div", null,
							h("div", { style: optionLabelStyle }, t("export.sessions")),
							h("div", { style: optionDescStyle }, t("export.sessionsDesc")),
						),
					),
					// 会话选择器
					exportOptions.sessions && availableSessions ? h("div", { style: { marginTop: "12px", padding: "12px", background: "var(--dsh-bg-secondary, #f9fafb)", borderRadius: "6px", border: "1px solid var(--dsh-border, #e5e7eb)" } },
						h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
							h("div", { style: { fontSize: "12px", fontWeight: 500, color: "var(--dsh-text-secondary, #6b7280)" } }, "选择要导出的会话（不选则导出全部）"),
							Object.keys(availableSessions).length > 0 ? h("div", { style: { display: "flex", gap: "8px" } },
								h("button", {
									style: { ...btnSecondaryStyle, padding: "2px 8px", fontSize: "11px" },
									onClick: () => {
										const allIds = Object.values(availableSessions).flat().map(s => s.id);
										setSelectedSessionIds(allIds);
									},
								}, "全选"),
								h("button", {
									style: { ...btnSecondaryStyle, padding: "2px 8px", fontSize: "11px" },
									onClick: () => setSelectedSessionIds([]),
								}, "取消全选")
							) : null
						),
						Object.keys(availableSessions).length === 0 ? h("div", { style: { fontSize: "12px", color: "var(--dsh-text-muted, #9ca3af)" } }, "暂无会话") :
						h("div", { style: { maxHeight: "200px", overflowY: "auto" } },
							Object.entries(availableSessions).map(([ws, sessions]) =>
								h("div", { key: ws, style: { marginBottom: "8px" } },
									h("div", { style: { fontSize: "11px", fontWeight: 600, color: "var(--dsh-text-secondary, #6b7280)", marginBottom: "4px" } }, ws.replace(/--/g, '').replace(/-/g, ' ').slice(0, 40)),
									sessions.map(s =>
										h("div", { key: s.id, style: { display: "flex", alignItems: "center", paddingLeft: "12px", fontSize: "12px" } },
											h("input", {
												type: "checkbox",
												style: { marginRight: "6px" },
												checked: selectedSessionIds.includes(s.id),
												onChange: (e) => {
													if (e.target.checked) {
														setSelectedSessionIds([...selectedSessionIds, s.id]);
													} else {
														setSelectedSessionIds(selectedSessionIds.filter(id => id !== s.id));
													}
												},
											}),
											h("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (s.title || s.id) + " (" + s.fileCount + " 文件, " + Math.round(s.totalSize / 1024) + "KB)")
										)
									)
								)
							)
						),
						selectedSessionIds.length > 0 ? h("div", { style: { marginTop: "8px", fontSize: "11px", color: "var(--dsh-text-muted, #9ca3af)" } }, "已选择 " + selectedSessionIds.length + " 个会话") : null
					) : null,
					h("button", {
						style: exportStatus === "exporting" ? btnDisabledStyle : btnPrimaryStyle,
						onClick: doExport,
						disabled: exportStatus === "exporting",
					}, exportStatus === "exporting" ? t("export.exporting") : t("export.submit")),
					exportStatus === "done" && exportResult ? h("div", { style: successStyle },
						h("div", { style: { fontWeight: 600 } }, "✅ " + t("export.success")),
						h("div", { style: pathStyle }, t("export.successPath") + " " + (exportResult.archivePath || exportResult.stagingPath)),
					) : null,
					exportError ? h("div", { style: errorStyle },
						h("div", { style: { fontWeight: 600 } }, "❌ " + t("export.error")),
						h("div", { style: { marginTop: "4px" } }, exportError),
					) : null,
				),
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
					importFile ? h("div", { style: { fontSize: "12px", color: "var(--dsh-text-muted, #6b7280)", marginTop: "-8px", marginBottom: "12px" } },
						"已选择：" + importFile.name + "（" + Math.max(1, Math.round(importFile.size / 1024)) + " KB）— 将直接上传文件内容",
					) : null,
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
						importResult.restored.mergedSessions ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#065f46" } },
							"🔀 已合并工作区记录：" + (importResult.restored.mergedWorkspaces || 0) + " 个工作区 / " + importResult.restored.mergedSessions + " 个会话",
						) : null,
						importResult.restored.unarchivedSessions ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#065f46" } },
							"📦 已从归档恢复 " + importResult.restored.unarchivedSessions + " 个会话——重启 DSH 后重新显示（归档集合无实时 API，需重启加载）",
						) : null,
						importResult.restored.presets > 0 ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#065f46" } },
							"🧩 已恢复 " + importResult.restored.presets + " 个 Agent 预设到 .agent-presets/（目录式布局）——预设列表立即生效，无需重启",
						) : null,
						importResult.restored.pluginList && importResult.restored.pluginList.length > 0 ? h("div", { style: { marginTop: "6px", fontSize: "12px" } },
							h("div", { style: { fontSize: "12px", color: "#b45309" } },
								"🔌 插件不会自动重装（共 " + importResult.restored.pluginList.length + " 个），清单已存到 exports/restored-plugin-manifest.json：",
							),
							h("div", { style: { marginTop: "2px", fontSize: "12px", color: "var(--dsh-text-muted, #6b7280)" } },
								importResult.restored.pluginList.map(p => (p.name || "?") + (p.version ? "@" + p.version : "")).join("、"),
							),
						) : null,
						importResult.restored.liveAttachedSessions ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#065f46" } },
							"⚡ 已实时登记 " + importResult.restored.liveAttachedSessions + " 个会话到 " + (importResult.restored.liveAttachedWorkspaces || 0) + " 个工作区——立即生效，无需重启",
						) : null,
						importResult.restored.attachErrors && importResult.restored.attachErrors.length > 0 ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#b45309" } },
							"⚠️ 部分会话登记失败：" + importResult.restored.attachErrors.join("；"),
						) : null,
						importResult.restored.missingWorkspacePaths && importResult.restored.missingWorkspacePaths.length > 0 ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#b45309" } },
							"⚠️ 以下工作区路径在本机不存在，其下的会话要等目录存在并作为工作区打开后才会显示：" + importResult.restored.missingWorkspacePaths.join("；"),
						) : null,
						importResult.skipped && importResult.skipped.corruptSessionLogs > 0 ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#b45309" } },
							"⚠️ 已跳过 " + importResult.skipped.corruptSessionLogs + " 个损坏的会话日志（来自旧版本导出的压缩包，本机数据未受影响）",
						) : null,
						importResult.skipped && importResult.skipped.unknownWorkspaceSessions > 0 ? h("div", { style: { marginTop: "4px", fontSize: "12px", color: "#b45309" } },
							"⚠️ 已跳过 " + importResult.skipped.unknownWorkspaceSessions + " 个无法识别工作区的会话（旧格式导出，缺少 manifest 映射）",
						) : null,
						importResult.skipped && importResult.skipped.machineSpecificConfigs > 0 ? h("div", { style: { marginTop: "4px", fontSize: "12px", color: "var(--dsh-text-muted, #6b7280)" } },
							"ℹ️ 已跳过 " + importResult.skipped.machineSpecificConfigs + " 个机器专属配置（package.json / 锁文件，避免破坏本机依赖布局）",
						) : null,
					) : null,
					importError ? h("div", { style: errorStyle },
						h("div", { style: { fontWeight: 600 } }, "❌ " + t("import.error")),
						h("div", { style: { marginTop: "4px" } }, importError),
					) : null,
				),
			);
		}

		const inject = ["slots"];

		function apply(ctx) {
			try {
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "harness-exporter",
					order: 25,
					label: () => DICT.zh["settings.tab"],
					inject: () => ({}),
				}, ExportImportSettingsSection));
			} catch (err) {
				console.error('[dsh-harness-exporter] apply failed:', err);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
