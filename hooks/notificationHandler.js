#!/usr/bin/env gjs

/**
 * Claude Code 通知处理器
 * 处理Claude Code退出事件并显示系统通知
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

// 尝试使用现代的GioUnix，如果不可用则回退到旧版本
let UnixInputStream;
try {
    // 暂时使用传统方法，因为GioUnix的ES6导入可能有问题
    UnixInputStream = Gio.UnixInputStream;
} catch (e) {
    // 回退到旧版本
    UnixInputStream = Gio.UnixInputStream;
}

// 导入gettext用于国际化 - 使用现代ESM语法
import {gettext as _} from 'gettext';

class NotificationHandler {
    constructor() {
        this.extensionPath = null;
        this.settings = null;
        this.telegramNotifier = null;
        this.soupSession = null; // Soup 3 session
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
            // 使用GJS内置的gettext绑定
            import('gettext').then(Gettext => {
                const localeDir = GLib.build_filenamev([this.extensionPath, 'locale']);
                Gettext.bindtextdomain('claude-code-switcher@nsjsv.github.io', localeDir);
                Gettext.textdomain('claude-code-switcher@nsjsv.github.io');
            }).catch(e => {
                console.error('Failed to load gettext module:', e);
            });
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
        // 初始化Soup Session用于HTTP请求
        try {
            this.soupSession = new Soup.Session();
            this.telegramNotifier = {
                isAvailable: true // Soup总是可用的
            };
            console.log('Telegram notifier initialized with Soup 3');
        } catch (e) {
            console.error('Failed to initialize Soup session:', e);
            this.telegramNotifier = {
                isAvailable: false
            };
        }
    }

    /**
     * 检查Telegram功能可用性 (使用Soup 3)
     */
    _checkTelegramAvailability() {
        // Soup 3总是可用的，不需要检查外部命令
        return this.soupSession !== null;
    }

    /**
     * 读取hook输入数据
     */
    readHookInput() {
        try {
            // 检查是否有stdin数据可读
            const stdin = new Gio.DataInputStream({
                base_stream: new UnixInputStream({ fd: 0 })
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
        
        // 处理其他类型的通知（使用新的合并设置）
        const taskCompletionEnabled = this.settings.get_boolean('hook-task-completion');
        
        // 对于完成和中断通知，统一使用task-completion设置
        if ((notificationInfo.type === 'normal' || notificationInfo.type === 'abnormal') && !taskCompletionEnabled) {
            return; // 任务完成通知未启用
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
        // 对于所有任务完成相关的通知，统一使用task-completion-message
        return this.settings ? 
            this.settings.get_string('task-completion-message') || _('Claude Code task completed.') :
            _('Claude Code task completed.');
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

            // 使用Soup 3发送Telegram消息
            this._sendTelegramViaSoup(botToken, chatId, formattedMessage).catch(e => {
                console.error('Async Telegram send failed:', e);
            });

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
     * 使用Soup 3发送Telegram消息
     * @param {string} botToken Bot Token
     * @param {string} chatId Chat ID
     * @param {string} message 消息内容
     */
    async _sendTelegramViaSoup(botToken, chatId, message) {
        try {
            if (!this.soupSession) {
                throw new Error('Soup session not initialized');
            }
            
            const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            
            // 构建请求数据
            const requestData = {
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            };
            
            // 创建HTTP消息
            const msg = Soup.Message.new('POST', apiUrl);
            if (!msg) {
                throw new Error('Failed to create HTTP message');
            }
            
            // 设置请求头
            const requestHeaders = msg.get_request_headers();
            requestHeaders.append('Content-Type', 'application/json');
            requestHeaders.append('User-Agent', 'Claude-Code-Switcher/1.0');
            
            // 设置请求体
            const jsonData = JSON.stringify(requestData);
            const requestBody = msg.get_request_body();
            requestBody.append_bytes(new GLib.Bytes(new TextEncoder().encode(jsonData)));
            
            // 发送请求并等待响应（带超时处理）
            const bytes = await Promise.race([
                new Promise((resolve, reject) => {
                    this.soupSession.send_and_read_async(
                        msg,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (session, result) => {
                            try {
                                const bytes = session.send_and_read_finish(result);
                                resolve(bytes);
                            } catch (e) {
                                reject(new Error(`HTTP request failed: ${e.message}`));
                            }
                        }
                    );
                }),
                // 15秒超时
                new Promise((_, reject) => {
                    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, () => {
                        reject(new Error('Request timeout after 15 seconds'));
                        return GLib.SOURCE_REMOVE;
                    });
                })
            ]);
            
            // 检查HTTP响应状态
            const statusCode = msg.get_status();
            if (statusCode !== Soup.Status.OK) {
                throw new Error(`HTTP error ${statusCode}: ${msg.get_reason_phrase()}`);
            }
            
            // 解析响应
            const responseText = new TextDecoder().decode(bytes.get_data());
            if (!responseText) {
                throw new Error('Empty response from Telegram API');
            }
            
            const response = JSON.parse(responseText);
            
            if (response.ok) {
                console.log(`Telegram通知发送成功，消息ID: ${response.result.message_id}`);
            } else {
                const errorMsg = response.description || 'Unknown API error';
                console.error('Telegram API错误:', errorMsg);
                
                // 提供用户友好的错误提示
                if (response.error_code === 400) {
                    if (response.description.includes('chat not found')) {
                        console.error('💡 提示: Chat ID无效或机器人未与用户开始对话，请先向机器人发送 /start 命令');
                    } else if (response.description.includes('bot token')) {
                        console.error('💡 提示: Bot Token 无效，请检查配置');
                    }
                } else if (response.error_code === 401) {
                    console.error('💡 提示: Bot Token 未授权或已过期');
                }
                
                throw new Error(`Telegram API error (${response.error_code}): ${errorMsg}`);
            }
            
        } catch (e) {
            // 统一错误处理
            const errorMessage = e.message || 'Unknown error occurred';
            console.error('发送Telegram消息失败:', errorMessage);
            
            // 根据错误类型提供不同的用户反馈
            if (errorMessage.includes('timeout')) {
                console.error('💡 提示: 网络连接超时，请检查网络连接');
            } else if (errorMessage.includes('not initialized')) {
                console.error('💡 提示: HTTP客户端初始化失败，请重启扩展');
            }
            
            throw e;
        }
    }

    /**
     * 测试Telegram配置
     * @returns {Promise<boolean>} 测试是否成功
     */
    async testTelegramConfiguration() {
        try {
            const testMessage = '🧪 这是一条测试消息，用于验证Telegram通知配置是否正确。';
            await this.sendTelegramNotification(testMessage, 'notification');
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