/**
 * @fileoverview Lake 编辑器前端入口（运行在 VSCode Webview 中）
 * 初始化语雀 Lake 编辑器，处理与扩展主机的双向消息通信
 */

/**
 * 将 File 对象转换为 Base64 DataURL
 * @param file File 对象（通常是图片）
 * @returns Promise<string> Base64 DataURL
 */
async function toBase64URL(file: File): Promise<string> {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 自定义标题输入框 React 组件
 * 当配置显示标题时，渲染在编辑器顶部
 * @param props.onChange 标题变化回调
 * @param props.onChangeEnd 按回车后的回调
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
function Title(props: {
  onChange?: (value: string) => void;
  onChangeEnd?: () => void;
}) {
  // @ts-expect-error not error
  return React.createElement('input', {
    className: 'lake-title',
    placeholder: '请输入标题',
    onChange: (e: any) => {
      props.onChange?.(e.target.value);
    },
    onKeyDown: (e: any) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        props.onChangeEnd?.();
      }
    },
  });
}

/**
 * 格式化 XML（Lake 格式）保存输出
 * 使用缩进让 XML 更容易阅读和版本控制
 * @param xml 原始 XML 字符串
 * @param config 配置对象，包含 formatLake 开关
 * @returns 格式化后的 XML
 */
function formatLake(xml: string, config: { formatLake: boolean}): string {
  if (!config.formatLake) {
    return xml;
  }
  const PADDING = ' '.repeat(2); // 缩进空格数
  const reg = /(>)(<)(\/*)/g;
  let formatted = '';
  let pad = 0;

  // 在每个标签之间添加换行符
  xml = xml.replace(reg, '$1\r\n$2$3');

  // 逐行添加缩进
  xml.split('\r\n').forEach((node) => {
    let indent = 0;
    if (node.match(/.+<\/\w[^>]*>$/)) {
      // 自闭合标签或者内容和结束标签在同一行
      indent = 0;
    } else if (node.match(/^<\/\w/)) {
      // 结束标签，减少缩进
      if (pad !== 0) {
        pad -= 1;
      }
    } else if (node.match(/^<\w([^>]*[^\/])?>.*$/)) {
      // 开始标签，增加缩进
      indent = 1;
    } else {
      indent = 0;
    }

    formatted += PADDING.repeat(pad) + node + '\r\n';
    pad += indent;
  });

  return formatted.trim();
}

/**
 * 编辑器配置接口
 */
interface EditorConfig {
  showTitle: boolean;
  showToc: boolean;
  showToolbar: boolean;
  formatLake: boolean;
  defaultFontSize: number;
  paragraphSpacing: boolean;
  uploadImageToGithub: boolean;
}

/**
 * 页面加载完成入口
 * 从扩展主机获取配置，初始化 Lake 编辑器，注册消息监听
 */
window.onload = async function () {
  // 启动时获取扩展资源路径和配置
  const [baseURI, config] = await Promise.all([
    window.message.callServer('getExtensionResource', '/media/editor'),
    window.message.callServer('getConfig'),
  ]) as [string, EditorConfig];

  // @ts-ignore
  const { createOpenEditor, createOpenViewer } = window.Doc;

  // 判断是否只读：从 .lakebook 打开是只读
  // @ts-expect-error not error
  const isReadOnly = window.currentResourceURI.scheme === 'lake';
  // @ts-expect-error not error
  const fileName = window.currentResourceURI.path.split('/').pop() as string;

  // 判断是否是 Markdown 文件
  const isMarkdown = fileName.toLowerCase().endsWith('.md');

  // 只读模式增加边距
  if (isReadOnly) {
    document.body.style.cssText = 'padding: 24px;';
  }

  // 文档标题上下文
  const ctx = {
    title: fileName.replace('.lake', ''),
  };

  // 禁用插件列表
  const disabledPlugins = ['save']; // 总是禁用内置保存，使用 VSCode 保存
  if (!config.showToolbar) {
    disabledPlugins.push('toolbar');
  }
  // Markdown 文件禁用不支持的非标准 Lake 组件
  // 保留 codeblock/inline-code/table 因为标准 Markdown 支持
  if (isMarkdown) {
    disabledPlugins.push(
      'math',     // 公式（标准 Markdown 不支持）
      'mindmap',     // 思维导图
      'file',        // 文件
      'video',       // 视频
      'audio',       // 音频
      'calendar',       // 日历
      'dateCard',       // 日期卡片
      'mention',       // @提及
      'columns',       // 多列布局
      'collapse',       // 折叠块
      'label',       // 标签
      'quote',       // 引用（使用原生引用）
      'alert',       // 高亮警告块
    );
  }

  // 创建编辑器：只读模式用 viewer，编辑模式用 editor
  const editor = (isReadOnly ? createOpenViewer : createOpenEditor)(document.getElementById('root'), {
    disabledPlugins,
    defaultFontsize: config.defaultFontSize,
    // 如果配置显示标题，渲染自定义标题组件
    // @ts-expect-error not error
    header: !isReadOnly && !isMarkdown && config.showTitle ? React.createElement(Title, {
      onChange(title: string) {
        ctx.title = title;
        // 内容变化通知扩展主机
        let lake = editor.getDocument(docScheme, { includeMeta: true });
        lake = lake.replace(/<!doctype lake>/, '<!doctype lake><title>' + title + '</title>');
        window.message.callServer('contentchange', lake);
      },
      onChangeEnd() {
        editor.execCommand('focus', 'start');
      },
    }) : null,
    // 书签处理
    bookmark: {
      recognizeYuque: true,
      fetchDetailHandler: async (url: string) => {
        // 默认处理，返回原样
        return Promise.resolve({
          url,
          title: '无标题',
        });
      },
    },
    // 排版配置
    typography: {
      typography: 'classic',
      paragraphSpacing: config.paragraphSpacing ? 'relax' : 'default',
    },
    // 目录配置
    toc: {
      enable: config.showToc,
    },
    // @ts-expect-error not error
    darkMode: window.isDarkMode,
    // 占位提示文字
    placeholder: {
      tip: '开始编辑',
      emptyParagraphTip: '输入 / 唤起更多',
    },
    // 输入配置
    input: {
      autoSpacing: true,
    },
    // 链接配置：接受所有链接
    link: {
      isValidURL() {
        return true;
      },
      sanitizeURL(url: string) {
        return url;
      }
    },
    // 代码块配置
    codeblock: {
      codemirrorURL: baseURI + '/CodeMirror.js',
      supportCustomStyle: true,
    },
    // 第三方服务配置
    thirdparty: {
      recognizeYuque: true,
    },
    // 数学公式配置
    math: {
      KaTexURL: baseURI + '/katex.js',
    },
    // 图片上传配置
    image: {
      isCaptureImageURL() {
        return false;
      },
      async createUploadPromise(request: any) {
        // base64 格式：粘贴图片进来
        if (request.type === 'base64') {
          const ret = {
            url: request.data,
            size: request.data.length * 0.75,
            name: 'image.png',
          };
          // 如果配置了上传到 GitHub，上传获取 URL
          if (config.uploadImageToGithub) {
            const githubURL = await window.message.callServer('uploadToGithub', request.data.replace(/data:.*base64,/, '')) as {url: string | false};
            ret.url = githubURL.url || ret.url;
          }
          return ret;
        }
        // File 对象格式：拖拽上传
        const url = await toBase64URL(request.data);
        const ret = {
          url,
          size: request.data.size,
          name: request.data.name,
        };
        if (config.uploadImageToGithub) {
          const githubURL = await window.message.callServer('uploadToGithub', url.replace(/data:.*base64,/, '')) as {url: string | false};
          ret.url = githubURL.url || ret.url;
        }
        return ret;
      },
    },
  });

  // @ts-expect-error not error
  window.editor = editor;

  // 监听编辑器内部链接跳转，转发给扩展主机
  editor.on('visitLink', (href: string) => {
    window.message.callServer('visitLink', href);
  });

  // 确定文档格式
  const docScheme = isMarkdown ? 'text/markdown' : 'text/lake';

  // 内容变化监听器取消函数
  let cancelChangeListener: () => void = () => {};

  // 监听扩展主机发来的消息
  window.addEventListener('message', async e => {
    switch (e.data.type) {
      case 'setActive':
        // 编辑器激活，请求焦点
        editor.execCommand('focus');
        break;
      case 'switchTheme':
        // 切换主题（VSCode 主题变化）
        // @ts-expect-error not error
        window.isDarkMode = (e.data.data as {isDark: boolean}).isDark;
        editor.theme.setActiveTheme(
          (e.data.data as {isDark: boolean}).isDark
            ? 'dark-mode'
            : 'default',
        );
        break;
      case 'windowStateChange':
        // 窗口焦点变化，激活时请求焦点
        if ((e.data.data as {active: boolean}).active) {
          editor?.execCommand('focus');
        }
        break;
      case 'undo':
        // 撤销
        editor.execCommand('undo');
        window.message.replayServer(e.data.requestId);
        break;
      case 'redo':
        // 重做
        editor.execCommand('redo');
        window.message.replayServer(e.data.requestId);
        break;
      case 'updateContent': {
        // 更新文档内容（外部修改后重新加载）
        cancelChangeListener();

        // 处理多种可能的数据格式，因为 postMessage 会反序列化二进制
        let lake: string;
        if (typeof e.data.data === 'string') {
          debugger
          // 已经是字符串
          console.info('updateContent received as string, length:', e.data.data.length);
          lake = e.data.data;
        } else {
          // 处理各种二进制格式
          let buffer: ArrayBuffer;
          // 处理 Node.js Buffer 序列化格式: { type: 'Buffer', data: [...] }
          // VSCode 扩展 -> webview 传递 Uint8Array 会被序列化成这个格式
          if (typeof e.data.data === 'object' && e.data.data !== null && 'type' in e.data.data && e.data.data.type === 'Buffer' && 'data' in e.data.data && Array.isArray(e.data.data.data)) {
            buffer = new Uint8Array(e.data.data.data).buffer;
          } else if (e.data.data instanceof ArrayBuffer) {
            // 原生 ArrayBuffer
            buffer = e.data.data;
          } else if (e.data.data instanceof Uint8Array) {
            // Uint8Array
            buffer = e.data.data.buffer;
          } else if ('buffer' in e.data.data && (e.data.data as any).buffer instanceof ArrayBuffer) {
            // Uint8Array 包装对象
            buffer = (e.data.data as any).buffer;
          } else if (Array.isArray(e.data.data)) {
            // 顶级就是字节数组
            buffer = new Uint8Array(e.data.data).buffer;
          } else {
            // 最后尝试：JSON 序列化后重新解析
            console.warn('Unexpected format for updateContent data:', typeof e.data.data, e.data.data);
            const jsonStr = JSON.stringify(e.data.data);
            buffer = new TextEncoder().encode(jsonStr ?? '').buffer;
          }
          lake = new TextDecoder().decode(buffer);
          console.info('updateContent received, length:', lake.length);
        }

        // 如果显示标题，从 XML 提取标题到输入框
        if (!isReadOnly && !isMarkdown && config.showTitle) {
          const m = lake.match(/<title>([\s\S]+?)<\/title>/);
          if (m) {
            ctx.title = m[1];
            const titleInput = document.querySelector('.lake-title');
            if (titleInput) {
              titleInput.setAttribute('value', ctx.title);
            }
          }
        }
        // 只有 lake 格式需要移除 title 标签，因为我们已经显示在单独输入框
        // markdown 格式本来就没有 title 标签，不需要移除
        if (!isMarkdown) {
          lake = lake.replace(/<title>[\s\S]+?<\/title>/g, '');
        }
        console.info('Calling editor.setDocument with', lake.length + ' bytes');
        editor.setDocument(docScheme, lake);

        // 延迟设置内容变化监听，确保编辑器完全初始化
        setTimeout(() => {
          // 监听编辑器内容变化，通知扩展主机
          const initialContent = editor.getDocument(docScheme, { includeMeta: true });
          console.info('After setDocument, document length:', initialContent.length);
          const newCancel = editor.on('contentchange', () => {
            let newContent = editor.getDocument(docScheme, { includeMeta: true });
            // 只有内容真正变化时才通知，避免不必要的脏标记
            if (newContent !== initialContent) {
              // 如果显示标题，把标题插回 XML
              if (!isMarkdown && config.showTitle) {
                newContent = newContent.replace(/<!doctype lake>/, '<!doctype lake><title>' + ctx.title + '</title>');
              }
              // 格式化后通知扩展主机
              window.message.callServer('contentchange', formatLake(newContent, config));
            }
          });
          // 确保 cancelChangeListener 总是可用
          cancelChangeListener = typeof newCancel === 'function' ? newCancel : () => {};
        }, 500);
        // 请求焦点
        editor.execCommand('focus');
        // 回复扩展主机请求完成
        window.message.replayServer(e.data.requestId);
        console.info('updateContent processed');
        break;
      }
      case 'getContent': {
        // 获取文档内容，响应保存请求
        let lake = editor.getDocument(e.data.data || docScheme, { includeMeta: true });
        // 如果显示标题，把标题插入到 XML
        if (!isMarkdown && config.showTitle && e.data.data !== 'text/markdown') {
          lake = lake.replace('<!doctype lake>', '<!doctype lake><title>' + ctx.title + '</title>');
        }
        // 格式化后回复
        window.message.replayServer(e.data.requestId, new TextEncoder().encode(formatLake(lake, config)));
        break;
      }

      case 'pasteAsPlainText': {
        // 粘贴为纯文本命令
        editor.execCommand('insertAtSelection', 'text/plain', e.data.data.clipboardText);
        window.message.replayServer(e.data.requestId);
        break;
      }

      case 'updateConfig': {
        // 配置更新
        config.uploadImageToGithub = e.data.data.uploadImageToGithub;
        window.message.replayServer(e.data.requestId);
        break;
      }
    }
  });

  // 通知扩展主机编辑器就绪
  window.message.callServer('ready');
};
