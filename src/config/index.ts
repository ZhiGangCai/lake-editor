import * as vscode from 'vscode';

/**
 * Lake Editor 配置管理器
 * 统一从 VSCode 设置读取配置，提供类型安全访问
 */
export class LakeEditorConfig {
  private readonly _prefix = 'lakeEditor';

  private _get<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration(this._prefix).get<T>(key, defaultValue);
  }

  /** 是否显示可编辑标题 */
  get showTitle(): boolean {
    return this._get('showTitle', false);
  }

  /** 是否显示目录 */
  get showToc(): boolean {
    return this._get('showToc', false);
  }

  /** 是否显示工具栏 */
  get showToolbar(): boolean {
    return this._get('showToolbar', true);
  }

  /** 保存时是否格式化 XML */
  get formatLake(): boolean {
    return this._get('formatLake', false);
  }

  /** 是否上传图片到 GitHub */
  get uploadImageToGithub(): boolean {
    return this._get('uploadImageToGithub', false);
  }

  /** 默认字号 */
  get defaultFontSize(): number {
    return this._get('defaultFontSize', 15);
  }

  /** 是否增加段间距 */
  get paragraphSpacing(): boolean {
    return this._get('paragraphSpacing', false);
  }
}

let _configInstance: LakeEditorConfig | undefined;

/**
 * 获取当前配置
 * 使用单例模式避免重复创建
 */
export function getConfig(): LakeEditorConfig {
  if (!_configInstance) {
    _configInstance = new LakeEditorConfig();
  }
  return _configInstance;
}

/**
 * 监听配置变更
 */
export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('lakeEditor')) {
      // 清除实例，下次获取重新读取
      _configInstance = undefined;
      callback();
    }
  });
}
