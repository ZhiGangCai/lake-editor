/* eslint-disable @typescript-eslint/naming-convention */
/**
 * @fileoverview .lakebook 文件解析模型
 * 解析 tar 压缩包，构建文档树，支持读取文档内容
 */

import * as vscode from 'vscode';
import * as path from 'path';
import Tar from 'tar';
import Yaml from 'yaml';
import { mkdirSync, writeFileSync } from 'fs';

/**
 * 树形节点接口
 */
export interface ILakeNode {
  title: string;
  type: 'DOC' | 'TITLE';
  sourceUri: vscode.Uri;
  url?: string;
  nodes?: ILakeNode[];
}

/**
 * 元数据接口
 */
export interface IMetaData {
  meta: string;
  meta_digest: string;
}

/**
 * 元配置接口
 */
export interface IMetaConfig {
  book: {
    path: string;
    public: 0 | 1;
    tocYml: string;
    type: string;
  };
  config: {
    endecryptType: number;
  };
  docs: [];
  version: string;
}

/**
 * 目录项接口
 */
export interface IToc {
  type: 'DOC' | 'TITLE';
  title: string;
  uuid: string;
  url: string;
  prev_uuid: string;
  sibling_uuid: string;
  child_uuid: string;
  parent_uuid: string;
  doc_id: number;
  level: number;
  id: number;
  open_window: number;
  visible: number;
}

/**
 * 文档条目接口
 */
export interface IDocEntry {
  doc: {
    body: string;
    body_asl: string;
    body_draft: string;
    body_draft_asl: string;
    content_updated_at: string;
    cover?: string;
    custom_cover?: string | null;
    created_at: string;
    custom_description?: string | null;
    description: string;
    editor_meta: string;
    first_published_at: string;
    format: string;
    id: number;
    public: number;
    published_at: string;
    slug: string;
    status: number;
    title: string;
    updated_at: string;
    user_id: number;
    word_count: number;
  };
  doc_digest: string;
}

/**
 * 目录节点实现
 */
export class ILakeTocNode implements ILakeNode {
  nodes: ILakeNode[] = [];

  constructor(private _toc: IToc, private _root: LakeRoot) {
  }

  public get id(): number {
    return this._toc.id;
  }

  public get uuid(): string {
    return this._toc.uuid;
  }

  public get url(): string {
    return this._toc.url;
  }

  public get title(): string {
    return this._toc.title;
  }

  public get sourceUri(): vscode.Uri {
    return this._root.sourceUri;
  }

  public get type(): 'DOC' | 'TITLE' {
    return this._toc.type;
  }
}

/**
 * lakebook 根节点，对应一个 .lakebook 文件
 */
export class LakeRoot implements ILakeNode {
  private _paths: string[] = [];
  private _entries: Tar.ReadEntry[] = [];
  private _title: string;
  /** 缓存 uuid → node */
  private nodeMap: Map<string, ILakeTocNode> = new Map();
  /** 一级子节点 */
  private childNodes: ILakeTocNode[] = [];

  /** 全局 LRU 缓存：文件路径 → LakeRoot */
  static map: Map<string, LakeRoot> = new Map();
  /** 最大缓存数量，超出后淘汰最少使用的 */
  static readonly MAX_CACHE_SIZE = 10;
  /** 解析 promise */
  private promise: Promise<void>;
  /** 条目缓存：路径 → entry，避免重复遍历 tar */
  private entryCache: Map<string, Tar.ReadEntry> = new Map();

  /**
   * 标准化 URI，去掉 lake 协议，转为 file 协议
   */
  static normalUri(uri: vscode.Uri): vscode.Uri {
    if (uri.scheme === 'lake') {
      return uri.with({
        scheme: 'file',
        path: uri.path.replace(/\.lakebook.*$/, '.lakebook'),
      });
    }
    return uri;
  }

  /**
   * 获取 LakeRoot，从缓存读取如果存在
   * LRU 策略：命中刷新位置，超出容量淘汰最少使用
   */
  static getLakeRoot(uri: vscode.Uri): LakeRoot {
    const normalUri = LakeRoot.normalUri(uri);
    const key = normalUri.toString();
    const lakeRoot = LakeRoot.map.get(key);
    if (lakeRoot) {
      // LRU: 命中后删除重新插入，放到最后表示最近使用
      LakeRoot.map.delete(key);
      LakeRoot.map.set(key, lakeRoot);
      return lakeRoot;
    } else {
      const root = new LakeRoot(normalUri);
      // 超出容量，删除第一个（最少使用）
      if (LakeRoot.map.size >= this.MAX_CACHE_SIZE) {
        const firstKey = LakeRoot.map.keys().next().value;
        LakeRoot.map.delete(firstKey);
      }
      LakeRoot.map.set(key, root);
      return root;
    }
  }

  /**
   * 从缓存移除
   */
  static removeLakeRoot(uri: vscode.Uri): void {
    const lakeRoot = LakeRoot.map.get(uri.toString());
    if (lakeRoot) {
      LakeRoot.map.delete(uri.toString());
    }
  }

  /**
   * 构造函数，解析 .lakebook tar 包
   */
  constructor(private _uri: vscode.Uri) {
    try {
      let metaDataStr = '';
      this._title = path.basename(this._uri.fsPath);
      this.promise = new Promise((resolve) => {
        // 遍历 tar 包，找到 $meta.json
        Tar.list({
          file: this._uri.fsPath,
          filter: (path: string): boolean => {
            return path.endsWith('$meta.json');
          },
          onentry: (entry: Tar.ReadEntry) => {
            this._entries.push(entry);
            this._paths.push(entry.path);
            this.entryCache.set(entry.path, entry);
            if (entry.path.endsWith('$meta.json')) {
              entry.on('data', (chunk) => {
                metaDataStr += chunk.toString();
              });
            }
          },
          sync: true,
        });
        resolve();
      });

      // 解析 meta 数据，构建目录树
      const metaData = JSON.parse(metaDataStr) as IMetaData;
      const metaConfig = JSON.parse(metaData.meta) as IMetaConfig;
      const tocs = Yaml.parse(metaConfig.book.tocYml) as IToc[];
      for (const toc of tocs) {
        const node = new ILakeTocNode(toc, this);
        this.nodeMap.set(toc.uuid, node);
        if (toc.level === 0) {
          this.childNodes.push(node);
        } else if (toc.parent_uuid) {
          const parentNode = this.nodeMap.get(toc.parent_uuid);
          if (parentNode) {
            parentNode.nodes.push(node);
          }
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(message);
    }
  }

  public get title(): string {
    return this._title;
  }

  public get type(): 'TITLE' {
    return 'TITLE';
  }

  public get sourceUri(): vscode.Uri {
    return this._uri;
  }

  public get nodes(): ILakeNode[] {
    return this.childNodes;
  }

  /**
   * 获取指定文档内容
   * @param uri 包含 query 指向文档 json
   */
  public async getContent(uri: vscode.Uri): Promise<Uint8Array> {
    await this.promise;

    // 从缓存查找，不需要重新遍历 tar 包
    let entry: Tar.ReadEntry | undefined;
    for (const [path, cachedEntry] of this.entryCache) {
      if (path.endsWith(uri.query)) {
        entry = cachedEntry;
        break;
      }
    }

    if (entry) {
      return new Promise((resolve, reject) => {
        let dataStr = '';
        entry.on('data', (chunk) => {
          dataStr += chunk.toString();
        });
        entry.on('end', () => {
          try {
            const docEntry = JSON.parse(dataStr) as IDocEntry;
            resolve(new TextEncoder().encode(docEntry.doc.body_asl));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    return new Uint8Array();
  }
}

/**
 * lakebook 模型，管理所有打开的 lakebook
 */
export class LakeBookModel {
  private _lakeRoots: LakeRoot[];

  constructor() {
    this._lakeRoots = [];
  }

  public get roots(): LakeRoot[] {
    return this._lakeRoots;
  }

  /**
   * 打开一个 lakebook
   */
  public openLakeBook(fileUri: vscode.Uri): void {
    this._lakeRoots.push(LakeRoot.getLakeRoot(fileUri));
  }

  /**
   * 关闭一个 lakebook
   */
  public closeLakebook(fileUri: vscode.Uri): void {
    const normalUri = LakeRoot.normalUri(fileUri);
    LakeRoot.removeLakeRoot(normalUri);
    const index = this._lakeRoots.findIndex(root => root.sourceUri.toString() === normalUri.toString());
    if (index >= 0) {
      this._lakeRoots.splice(index, 1);
    }
  }

  /**
   * 解压整个 lakebook 到指定目录
   */
  public unzipLakeBook(fileUri: vscode.Uri, parentDir: string): void {
    const root = LakeRoot.getLakeRoot(fileUri);
    void this.unzipNode(root, parentDir);
  }

  /**
   * 递归解压节点
   */
  public async unzipNode(node: ILakeNode | LakeRoot, parentDir: string): Promise<void> {
    if (node.nodes?.length > 0 || node.type === 'TITLE') {
      // 创建目录
      parentDir = path.resolve(parentDir, node.title.replace('.lakebook', ''));
      mkdirSync(parentDir, { recursive: true });
    }
    // 文档文件直接写出
    if (node.type === 'DOC') {
      const content = await this.getLakeRootContent(node.sourceUri.with({
        scheme: 'lake',
        path: path.join(node.sourceUri.path.replace(/^\/([^:+]:)/, '$1'), node.title),
        query: node.url + '.json',
      }));
      writeFileSync(path.resolve(parentDir, node.title + '.lake'), content);
    }
    // 递归解压子节点
    if (node.nodes?.length > 0) {
      await Promise.all(node.nodes.map(childNode => this.unzipNode(childNode, parentDir)));
    }
  }

  /**
   * 获取文档内容
   */
  public getLakeRootContent(uri: vscode.Uri): Promise<Uint8Array> {
    const root = LakeRoot.getLakeRoot(uri);
    return root.getContent(uri);
  }

  /**
   * 静态方法：获取 lake:// URI 内容
   */
  static async getLakeURIContent(uri: vscode.Uri): Promise<Uint8Array> {
    const root = LakeRoot.getLakeRoot(uri);
    return root.getContent(uri);
  }
}
