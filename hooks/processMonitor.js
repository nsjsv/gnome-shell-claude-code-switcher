#!/usr/bin/env gjs

/**
 * Claude Code 进程监控器
 * 简化版本：启动后立即退出，避免阻塞Claude Code启动
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// 导入gettext用于国际化 - 使用传统方法，因为hooks脚本可能需要兼容性
const Gettext = imports.gettext;
const _ = Gettext.gettext;

class ProcessMonitor {
    constructor() {
        this.extensionPath = null;
        this.settings = null;
    }

    /**
     * 初始化监控器
     */
    init() {
        // 获取扩展路径
        this.extensionPath = GLib.path_get_dirname(GLib.path_get_dirname(imports.system.programPath));
        
        // 初始化翻译
        this.initTranslations();
        
        // 加载设置
        if (!this.loadSettings()) {
            console.error('Failed to load extension settings');
            return false;
        }

        return true;
    }

    /**
     * 初始化翻译
     */
    initTranslations() {
        try {
            const localeDir = GLib.build_filenamev([this.extensionPath, 'locale']);
            Gettext.bindtextdomain('claude-code-switcher@nsjsv.github.io', localeDir);
            Gettext.textdomain('claude-code-switcher@nsjsv.github.io');
        } catch (e) {
            console.error('Failed to initialize translations:', e);
        }
    }

    /**
     * 加载扩展设置
     */
    loadSettings() {
        try {
            const schemaDir = GLib.build_filenamev([this.extensionPath, 'schemas']);
            const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDir,
                Gio.SettingsSchemaSource.get_default(),
                false
            );
            
            const schema = schemaSource.lookup('org.gnome.shell.extensions.claude-code-switcher', false);
            if (schema) {
                this.settings = new Gio.Settings({ settings_schema: schema });
                return true;
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return false;
    }

    /**
     * 检查设置并启动后台监控
     */
    checkAndStartMonitoring() {
        // 检查是否启用了任务完成通知
        const notificationsEnabled = this.settings.get_boolean('notifications-enabled');
        const taskCompletionEnabled = this.settings.get_boolean('hook-task-completion');
        
        if (!notificationsEnabled || !taskCompletionEnabled) {
            console.log('Task completion notifications disabled');
            return;
        }

        console.log('Process monitor initialized (background mode)');
        
        // 这里可以启动一个真正的后台监控进程
        // 但为了避免阻塞Claude Code启动，我们暂时只记录日志
        // 实际的任务完成检测通过Stop hook实现
    }

    /**
     * 运行监控器
     */
    run() {
        if (this.init()) {
            this.checkAndStartMonitoring();
        }
        
        // 立即退出，不阻塞Claude Code启动
        console.log('Process monitor completed initialization');
    }
}

// 主程序入口
const monitor = new ProcessMonitor();
monitor.run();