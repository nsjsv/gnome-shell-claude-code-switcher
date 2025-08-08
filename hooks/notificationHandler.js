#!/usr/bin/env gjs

/**
 * Claude Code 通知处理器
 * 处理Claude Code退出事件并显示系统通知
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// 导入gettext用于国际化
const Gettext = imports.gettext;
const _ = Gettext.gettext;

class NotificationHandler {
    constructor() {
        this.extensionPath = null;
        this.settings = null;
        this.telegramNotifier = null;
    }

    /**
     * 初始化应用程序
     */
    init() {
        // 获取扩展路径
        this.extensionPath = GLib.path_get_dirname(GLib.path_get_dirname(imports.system.programPath));
        
        // 初始化翻译
        this.initTranslations();
        
        // 初始化Telegram通知器
        this._initTelegramNotifier();
        
        // 直接处理通知，不需要GTK应用
        this.handleNotification();
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
     * 初始化Telegram通知器
     */
    _initTelegramNotifier() {
        // 简单标记，实际的Telegram功能在发送时检查
        this.telegramNotifier = {
            isAvailable: this._checkTelegramAvailability()
        };
    }

    /**
     * 检查Telegram功能可用性
     */
    _checkTelegramAvailability() {
        try {
            // 检查curl命令是否可用（用于发送HTTP请求）
            const result = GLib.spawn_command_line_sync('which curl');
            return result[0]; // 如果curl存在则返回true
        } catch (e) {
            console.debug('curl not available, Telegram notifications disabled');
            return false;
        }
    }

    /**
     * 读取hook输入数据
     */
    readHookInput() {
        try {
            // 检查是否有stdin数据可读
            const stdin = new Gio.DataInputStream({
                base_stream: new Gio.UnixInputStream({ fd: 0 })
            });
            
            // 设置非阻塞模式
            const baseStream = stdin.get_base_stream();
            if (baseStream.set_blocking) {
                baseStream.set_blocking(false);
            }
            
            let inputData = '';
            let attempts = 0;
            const maxAttempts = 10; // 最多尝试10次
            
            while (attempts < maxAttempts) {
                try {
                    const line = stdin.read_line(null)[0];
                    if (line !== null) {
                        inputData += new TextDecoder().decode(line) + '\n';
                    } else {
                        break; // 没有更多数据
                    }
                } catch (e) {
                    // 没有数据可读或读取完毕
                    break;
                }
                attempts++;
            }
            
            if (inputData.trim()) {
                return JSON.parse(inputData.trim());
            }
        } catch (e) {
            console.error('Failed to read hook input:', e);
        }
        return null;
    }

    /**
     * 判断退出类型和通知类型
     * 根据Claude Code hooks数据结构：
     * - Stop hook会在停止时触发，但需要检查stop_hook_active字段
     * - stop_hook_active: true 表示正常完成
     * - stop_hook_active: false 表示异常停止
     * - Notification hook在Claude Code发送通知时触发
     */
    getNotificationType(hookData) {
        // 没有hook数据通常意味着异常退出
        if (!hookData) {
            return { type: 'abnormal', isNotification: false };
        }
        
        // Notification hook - Claude Code发送通知时触发
        if (hookData.hook_event_name === 'Notification') {
            return {
                type: 'notification',
                isNotification: true,
                message: hookData.message || 'Claude Code notification'
            };
        }
        
        // Stop hook - 需要检查stop_hook_active字段来区分正常/异常退出
        if (hookData.hook_event_name === 'Stop') {
            // stop_hook_active为true表示正常完成，false表示异常停止
            const isNormalExit = hookData.stop_hook_active === true;
            return {
                type: isNormalExit ? 'normal' : 'abnormal',
                isNotification: false
            };
        }
        
        // 其他未知hook事件，按异常处理
        return { type: 'abnormal', isNotification: false };
    }

    /**
     * 处理通知
     */
    handleNotification() {
        if (!this.loadSettings()) {
            console.error('Failed to load extension settings');
            return;
        }

        const hookData = this.readHookInput();
        
        // 添加调试输出，查看实际的hook数据结构
        if (hookData) {
            console.log('Hook数据:', JSON.stringify(hookData, null, 2));
        } else {
            console.log('没有接收到hook数据');
        }
        
        const notificationInfo = this.getNotificationType(hookData);
        
        // 检查通知设置是否启用
        const notificationsEnabled = this.settings.get_boolean('notifications-enabled');
        if (!notificationsEnabled) {
            return; // 通知功能未启用
        }
        
        // 处理Notification hook事件
        if (notificationInfo.isNotification) {
            const notificationHookEnabled = this.settings.get_boolean('hook-notification');
            if (notificationHookEnabled) {
                this.showNotificationHookMessage(notificationInfo.message, hookData);
            }
            return;
        }
        
        // 处理其他类型的通知（保持原有逻辑）
        const normalExitEnabled = this.settings.get_boolean('hook-normal-exit');
        const abnormalExitEnabled = this.settings.get_boolean('hook-abnormal-exit');
        
        // 根据退出类型决定是否显示通知
        if (notificationInfo.type === 'normal' && !normalExitEnabled) {
            return; // 正常退出通知未启用
        }
        
        if (notificationInfo.type === 'abnormal' && !abnormalExitEnabled) {
            return; // 异常退出通知未启用
        }
        
        // 显示系统通知
        const isNormal = (notificationInfo.type === 'normal');
        this.showSystemNotification(isNormal, hookData);
    }

    /**
     * 显示Notification hook消息
     */
    showNotificationHookMessage(message, hookData) {
        try {
            const title = _('Claude Code Notification');
            const iconName = 'dialog-information-symbolic';
            
            // 获取自定义消息
            const customMessage = this.settings.get_string('notification-hook-message') || message;
            
            // 执行自定义Hook命令（如果有）
            this.executeCustomHookCommand('notification', customMessage, hookData);
            
            // 显示系统通知
            this.sendSystemNotification(title, customMessage, iconName);
            
            // 发送Telegram通知
            this.sendTelegramNotification(customMessage, 'notification');
            
        } catch (e) {
            console.error('Failed to show notification hook message:', e);
            // 如果系统通知失败，回退到控制台输出
            console.log(`Claude Code Notification Hook: ${message}`);
        }
    }

    /**
     * 显示系统通知
     */
    showSystemNotification(isNormal, hookData) {
        try {
            const title = isNormal ? _('Claude Code Completed') : _('Claude Code Exited');
            const message = this.getNotificationMessage(isNormal, hookData);
            const iconName = isNormal ? 'emblem-ok-symbolic' : 'dialog-warning-symbolic';
            
            // 执行自定义Hook命令（如果有）
            const commandType = isNormal ? 'normal-exit' : 'abnormal-exit';
            this.executeCustomHookCommand(commandType, message, hookData);
            
            // 显示系统通知
            this.sendSystemNotification(title, message, iconName);
            
            // 发送Telegram通知
            const telegramType = isNormal ? 'normal' : 'abnormal';
            this.sendTelegramNotification(message, telegramType);
            
        } catch (e) {
            console.error('Failed to show system notification:', e);
            // 如果系统通知失败，回退到控制台输出
            console.log(`Claude Code Notification: ${isNormal ? 'Completed' : 'Exited'} - ${this.getNotificationMessage(isNormal, hookData)}`);
        }
    }

    /**
     * 获取通知消息
     */
    getNotificationMessage(isNormal, hookData) {
        if (isNormal) {
            return this.settings ? 
                this.settings.get_string('normal-exit-message') || _('Claude Code has completed successfully!') :
                _('Claude Code has completed successfully!');
        } else {
            return this.settings ? 
                this.settings.get_string('abnormal-exit-message') || _('Claude Code exited unexpectedly.') :
                _('Claude Code exited unexpectedly.');
        }
    }

    /**
     * 打开扩展设置
     */
    openExtensionSettings() {
        try {
            GLib.spawn_command_line_async('gnome-extensions prefs claude-code-switcher@nsjsv.github.io');
        } catch (e) {
            console.error('Failed to open extension settings:', e);
        }
    }

    /**
     * 执行自定义Hook命令
     */
    executeCustomHookCommand(commandType, message, hookData) {
        try {
            const customCommandsJson = this.settings.get_string('custom-hook-commands');
            if (!customCommandsJson) return;
            
            const customCommands = JSON.parse(customCommandsJson);
            const command = customCommands[commandType];
            
            if (!command) return;
            
            // 替换命令中的变量
            let processedCommand = command
                .replace(/{message}/g, message || '')
                .replace(/{exitCode}/g, hookData?.exit_code || '0')
                .replace(/{provider}/g, this.getCurrentProvider() || 'Unknown');
            
            // 异步执行自定义命令
            GLib.spawn_command_line_async(processedCommand);
            
        } catch (e) {
            console.error('Failed to execute custom hook command:', e);
        }
    }

    /**
     * 发送系统通知（使用自定义设置）
     */
    sendSystemNotification(title, message, iconName) {
        try {
            // 获取通知设置
            const urgency = this.settings.get_string('notification-urgency') || 'normal';
            const timeout = this.settings.get_int('notification-timeout') || 5000;
            const soundEnabled = this.settings.get_boolean('notification-sound-enabled') || false;
            const soundFile = this.settings.get_string('notification-sound-file');
            
            // 构建notify-send命令
            const command = [
                'notify-send',
                '--app-name=Claude Code Switcher',
                `--icon=${iconName}`,
                `--urgency=${urgency}`,
            ];
            
            // 添加超时设置（0表示不自动消失）
            if (timeout > 0) {
                command.push(`--expire-time=${timeout}`);
            }
            
            command.push(title, message);
            
            // 发送通知
            GLib.spawn_async(null, command, null, GLib.SpawnFlags.SEARCH_PATH, null);
            
            // 播放声音（如果启用）
            if (soundEnabled) {
                this.playNotificationSound(soundFile);
            }
            
        } catch (e) {
            console.error('Failed to send system notification:', e);
            // 回退到控制台输出
            console.log(`${title}: ${message}`);
        }
    }

    /**
     * 播放通知声音
     */
    playNotificationSound(soundFile) {
        try {
            if (soundFile && soundFile.trim()) {
                // 使用自定义声音文件
                const command = ['paplay', soundFile];
                GLib.spawn_async(null, command, null, GLib.SpawnFlags.SEARCH_PATH, null);
            } else {
                // 使用系统默认通知声音
                const command = ['canberra-gtk-play', '--id', 'message-new-instant'];
                GLib.spawn_async(null, command, null, GLib.SpawnFlags.SEARCH_PATH, null);
            }
        } catch (e) {
            console.debug('Failed to play notification sound:', e);
            // 声音播放失败不是致命错误，只记录调试信息
        }
    }

    /**
     * 获取当前提供商名称
     */
    getCurrentProvider() {
        try {
            return this.settings.get_string('current-provider') || 'Unknown';
        } catch (e) {
            return 'Unknown';
        }
    }

    /**
     * 发送Telegram通知
     * @param {string} message 消息内容
     * @param {string} messageType 消息类型 (normal, abnormal, notification)
     */
    sendTelegramNotification(message, messageType) {
        try {
            // 检查Telegram是否启用和配置
            if (!this.settings || !this.settings.get_boolean('telegram-enabled')) {
                return; // Telegram未启用
            }

            const botToken = this.settings.get_string('telegram-bot-token');
            const chatId = this.settings.get_string('telegram-chat-id');

            if (!botToken || !chatId || botToken.trim() === '' || chatId.trim() === '') {
                console.debug('Telegram not configured properly');
                return;
            }

            if (!this.telegramNotifier || !this.telegramNotifier.isAvailable) {
                console.debug('Telegram functionality not available');
                return;
            }

            // 格式化消息
            const formattedMessage = this._formatTelegramMessage(message, messageType);

            // 使用curl发送Telegram消息
            this._sendTelegramViaCurl(botToken, chatId, formattedMessage);

        } catch (e) {
            console.error('Failed to send Telegram notification:', e);
        }
    }

    /**
     * 格式化Telegram消息
     * @param {string} message 原始消息
     * @param {string} messageType 消息类型
     * @returns {string} 格式化后的消息
     */
    _formatTelegramMessage(message, messageType) {
        const timestamp = new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // 根据消息类型选择图标和标题
        let icon = '🤖';
        let title = 'Claude Code';
        
        switch (messageType) {
            case 'normal':
                icon = '✅';
                title = 'Claude Code 完成';
                break;
            case 'abnormal':
                icon = '❌';
                title = 'Claude Code 异常';
                break;
            case 'notification':
                icon = '🔔';
                title = 'Claude Code 通知';
                break;
        }

        // 获取当前提供商信息
        const currentProvider = this.getCurrentProvider();

        // 构建格式化消息（使用Markdown格式）
        const formattedMessage = `${icon} *${title}*

📝 ${message}

🔧 提供商: \`${currentProvider}\`
🕐 时间: \`${timestamp}\`

_来自 Claude Code Switcher_`;

        return formattedMessage;
    }

    /**
     * 使用curl发送Telegram消息
     * @param {string} botToken Bot Token
     * @param {string} chatId Chat ID
     * @param {string} message 消息内容
     */
    _sendTelegramViaCurl(botToken, chatId, message) {
        try {
            const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            
            // 构建请求数据
            const requestData = {
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            };

            // 构建curl命令
            const jsonData = JSON.stringify(requestData);
            const curlCommand = [
                'curl',
                '-s',
                '-X', 'POST',
                '-H', 'Content-Type: application/json',
                '-d', jsonData,
                apiUrl
            ];


            // 使用同步方式获取响应以便调试
            const [success, stdout, stderr, exitStatus] = GLib.spawn_sync(
                null,
                curlCommand,
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null
            );

            if (success && exitStatus === 0) {
                try {
                    const response = JSON.parse(new TextDecoder().decode(stdout));
                    if (response.ok) {
                        console.log(`Telegram通知发送成功，消息ID: ${response.result.message_id}`);
                    } else {
                        console.error('Telegram API错误:', response.description);
                        if (response.error_code === 400 && response.description.includes('chat not found')) {
                            console.error('💡 提示: Chat ID无效或机器人未与用户开始对话，请先向机器人发送 /start 命令');
                        }
                    }
                } catch (e) {
                    console.error('解析Telegram API响应失败:', e.message);
                    console.error('原始响应:', new TextDecoder().decode(stdout));
                }
            } else {
                const errorMsg = stderr ? new TextDecoder().decode(stderr) : 'Unknown error';
                console.error('Telegram网络请求失败:', errorMsg);
            }

        } catch (e) {
            console.error('发送Telegram消息失败:', e);
        }
    }

    /**
     * 测试Telegram配置
     * @returns {boolean} 测试是否成功
     */
    testTelegramConfiguration() {
        try {
            const testMessage = '🧪 这是一条测试消息，用于验证Telegram通知配置是否正确。';
            this.sendTelegramNotification(testMessage, 'notification');
            return true;
        } catch (e) {
            console.error('Telegram test failed:', e);
            return false;
        }
    }

    /**
     * 运行应用程序
     */
    run() {
        this.init();
    }
}

// 主程序入口
const handler = new NotificationHandler();
handler.run();