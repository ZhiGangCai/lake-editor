/**
 * @fileoverview GitHub API 核心封装
 * 用于图片上传功能：自动创建仓库并上传图片，返回 CDN 地址
 */

import * as vscode from 'vscode';
import { Octokit } from "@octokit/rest";
import type { RequestError } from "@octokit/types";
import { randomUUID } from 'crypto';

/**
 * 类型守卫：判断是否是 GitHub 请求错误
 */
function isRequestError(err: unknown): err is RequestError {
    return err !== null && typeof err === 'object' && 'status' in err && 'message' in err;
}

/**
 * GitHub 图片上传核心类
 *
 * 流程：
 * 1. 使用 VSCode GitHub 认证获取 access token
 * 2. 检查目标仓库是否存在，如果不存在自动创建
 * 3. 上传图片，返回公开访问 URL
 */
export class GithubCore {
    /** 认证会话 */
    session: vscode.AuthenticationSession | undefined;
    /** Octokit 实例 */
    octokit: Octokit | undefined;
    /** 仓库信息 */
    repo: {
        id: number;
        node_id: string;
        name: string;
        full_name: string;
    } | undefined;

    /**
     * 获取 GitHub 认证会话
     * @returns 是否认证成功
     */
    async getSession(): Promise<boolean> {
        if (this.octokit) {
            return true;
        }
        try {
            // 需要 scope: user:email repo gist
            const session = await vscode.authentication.getSession('github', ['user:email', 'repo', 'gist'], { createIfNone: true });
            if (session) {
                this.session = session;
                this.octokit = new Octokit({
                    auth: session.accessToken,
                    log: console,
                });
                vscode.window.showInformationMessage(`GitHub 认证成功: ${session.account.label}`);
                return true;
            } else {
                vscode.window.showErrorMessage('GitHub 认证失败：未获取到会话');
                return false;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`认证错误: ${message}`);
            return false;
        }
    }

    /**
     * 确保图片仓库存在
     * 如果不存在则自动创建 vscode-lake-images 仓库
     * @returns 是否成功
     */
    async ensureRepository(): Promise<boolean> {
        if (!this.session && !await this.getSession()) {
            return false;
        }
        // 先检查仓库是否已存在
        const repoResult = await this.octokit?.repos.get({
            owner: this.session!.account.label,
            repo: 'vscode-lake-images',
        }).catch(err => {
            return err as RequestError;
        });
        if (!isRequestError(repoResult)) {
            this.repo = repoResult.data;
            return true;
        }
        // 仓库不存在，创建新仓库
        const createResult = await this.octokit?.repos.createForAuthenticatedUser({
            name: 'vscode-lake-images',
            description: 'Images for vscode-lake-editor uploaded via lake-editor extension',
            auto_init: true,
            private: false,
        }).catch(err => {
            return err as RequestError;
        });
        if (isRequestError(createResult)) {
            // 创建成功 status 应该是 201
            if (createResult.status === 201) {
                const getResult = await this.octokit?.repos.get({
                    owner: this.session!.account.label,
                    repo: 'vscode-lake-images',
                }).catch(err => {
                    return err as RequestError;
                });
                if (!isRequestError(getResult)) {
                    this.repo = getResult.data;
                    vscode.window.showInformationMessage(`仓库创建成功: ${getResult.data.full_name}`);
                    return true;
                }
            }
            const errors = createResult.errors?.map(v => v.message).join(', ') || createResult.message;
            vscode.window.showErrorMessage(`仓库创建失败: ${createResult.status} ${errors}`);
            return false;
        }
        this.repo = createResult.data;
        return true;
    }

    /**
     * 上传图片到 GitHub
     * @param base64 图片 base64 编码数据
     * @returns 图片访问 URL，失败返回 false
     */
    async uploadImage(base64: string): Promise<string | false> {
        // 确保仓库存在
        if (!this.repo && !await this.ensureRepository()) {
            return false;
        }
        if (!this.octokit || !this.session) {
            vscode.window.showErrorMessage('GitHub 未认证');
            return false;
        }
        // 按日期分组存储
        const today = new Date();
        const datePath = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        const filePath = `${datePath}/${randomUUID()}.png`;
        // 创建文件
        const result = await this.octokit.repos.createOrUpdateFileContents({
            path: filePath,
            owner: this.session.account.label,
            repo: 'vscode-lake-images',
            message: 'upload image from lake-editor',
            content: base64,
        }).catch(err => {
            console.error(err);
            return err as RequestError;
        });

        // 上传成功，返回 raw 格式 URL
        if ('status' in result && result.status === 201) {
            return `https://raw.githubusercontent.com/${this.session.account.label}/vscode-lake-images/main/${filePath}`;
        }
        // 处理错误
        if (isRequestError(result)) {
            const errors = result.errors?.map(v => v.message).join(', ') || result.message;
            vscode.window.showErrorMessage(`图片上传失败: ${result.status} ${errors}`);
            return false;
        }
        // @ts-ignore 最后的兼容处理
        return (result as any).data?.content?.download_url || false;
    }
}

/**
 * 获取 GithubCore 单例
 */
export function getGithubCore() {
    return new GithubCore();
}
