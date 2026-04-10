/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * 批量释放一组 disposable 资源
 * @param disposables 需要释放的资源数组
 */
export function disposeAll(disposables: vscode.Disposable[]): void {
	while (disposables.length) {
		const item = disposables.pop();
		if (item) {
			item.dispose();
		}
	}
}

/**
 * 可释放资源的基类
 *
 * 提供自动资源管理，所有注册的子资源在 dispose 时会自动释放
 * 用于防止内存泄漏，是 VSCode 扩展开发中管理资源的标准方式
 */
export abstract class Disposable {
	/** 是否已释放 */
	private _isDisposed = false;

	/** 存储需要释放的子资源 */
	protected _disposables: vscode.Disposable[] = [];

	/**
	 * 释放所有资源
	 * 会自动释放所有通过 `_register` 注册的资源
	 */
	public dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		disposeAll(this._disposables);
	}

	/**
	 * 注册一个需要管理的资源
	 * 当 this 被 dispose 时，这个资源也会被自动 dispose
	 * @param value 要注册的资源
	 * @returns 返回传入的 value，便于链式调用
	 */
	protected _register<T extends vscode.Disposable>(value: T): T {
		if (this._isDisposed) {
			value.dispose();
		} else {
			this._disposables.push(value);
		}
		return value;
	}

	/**
	 * 当前是否已经被释放
	 */
	public get isDisposed(): boolean {
		return this._isDisposed;
	}
}
