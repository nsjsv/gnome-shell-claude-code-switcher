import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * 通知设置组件
 * 负责创建和管理Claude Code hooks通知设置界面
 */
export class NotificationsGroup {
    constructor(settings) {
        this._settings = settings;
        // 初始化Soup session用于HTTP请求（替代curl）
        this._soupSession = new Soup.Session();
    }

    /**
     * 创建通知设置组
     * @returns {Adw.PreferencesGroup} 通知设置组
     */
    createNotificationsGroup() {
        const notificationsGroup = new Adw.PreferencesGroup({
            title: _('Notifications'),
            description: _('Get notified when Claude Code tasks complete or need attention'),
        });

        // 通知主开关（使用 ExpanderRow 实现展开/折叠）
        const notificationsToggle = new Adw.ExpanderRow({
            title: _('Enable Notifications'),
            subtitle: _('Get desktop notifications for Claude Code events'),
            show_enable_switch: true,
        });
        notificationsGroup.add(notificationsToggle);

        // 绑定主开关到设置
        this._settings.bind('notifications-enabled', notificationsToggle, 'enable_expansion',
            Gio.SettingsBindFlags.DEFAULT);

        // 添加基本通知开关
        this._addBasicNotificationSwitches(notificationsToggle);

        // 添加高级设置按钮
        this._addAdvancedSettingsButton(notificationsToggle);

        return notificationsGroup;
    }

    /**
     * 添加基本通知开关
     * @param {Adw.ExpanderRow} notificationsToggle 通知主开关展开行
     */
    _addBasicNotificationSwitches(notificationsToggle) {
        // Task Completion Notifications (包含完成和中断)
        const taskCompletionRow = new Adw.SwitchRow({
            title: _('Task Completion Notifications'),
            subtitle: _('Show notifications when Claude Code completes tasks or encounters issues'),
        });
        
        this._settings.bind('hook-task-completion', taskCompletionRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        
        notificationsToggle.add_row(taskCompletionRow);

        // Tool Authorization Notifications
        const notificationHookRow = new Adw.SwitchRow({
            title: _('Tool Authorization Notifications'),
            subtitle: _('Show notifications when Claude Code needs permission or is waiting for input'),
        });
        
        this._settings.bind('hook-notification', notificationHookRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        
        notificationsToggle.add_row(notificationHookRow);
    }

    /**
     * 添加高级设置按钮
     * @param {Adw.ExpanderRow} notificationsToggle 通知主开关展开行
     */
    _addAdvancedSettingsButton(notificationsToggle) {
        const advancedRow = new Adw.ActionRow({
            title: _('Advanced Settings'),
            subtitle: _('Customize notification messages and setup external notifications'),
            activatable: true,
        });

        // 添加箭头图标
        const arrowIcon = new Gtk.Image({
            icon_name: 'go-next-symbolic',
            css_classes: ['dim-label'],
        });
        advancedRow.add_suffix(arrowIcon);

        // 点击事件
        advancedRow.connect('activated', () => {
            this._showAdvancedSettingsDialog();
        });

        notificationsToggle.add_row(advancedRow);
    }

    /**
     * 显示高级设置对话框
     */
    _showAdvancedSettingsDialog() {
        const dialog = new Adw.Window({
            title: _('Advanced Notification Settings'),
            default_width: 600,
            default_height: 500,
            modal: true,
        });

        // 创建主容器
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });

        // 创建头部栏
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: _('Advanced Notification Settings'),
            }),
        });
        mainBox.append(headerBar);

        // 创建滚动容器
        const scrolledWindow = new Gtk.ScrolledWindow({
            hexpand: true,
            vexpand: true,
        });

        // 创建设置页面
        const preferencesPage = new Adw.PreferencesPage();
        scrolledWindow.set_child(preferencesPage);

        // 添加自定义消息组
        this._addCustomMessagesGroup(preferencesPage);

        // 添加通知行为设置组
        this._addNotificationBehaviorGroup(preferencesPage);


        // 添加Telegram设置组
        this._addTelegramSettingsGroup(preferencesPage);

        mainBox.append(scrolledWindow);
        dialog.set_content(mainBox);

        dialog.present();
    }

    /**
     * 添加自定义消息设置组
     * @param {Adw.PreferencesPage} preferencesPage 设置页面
     */
    _addCustomMessagesGroup(preferencesPage) {
        const messagesGroup = new Adw.PreferencesGroup({
            title: _('Custom Messages'),
            description: _('Personalize the text shown in notifications'),
        });

        // Task Completion Message (统一消息)
        const taskCompletionMessageRow = new Adw.EntryRow({
            title: _('Task Completion Message'),
            text: this._settings.get_string('task-completion-message') || 'Claude Code task completed.',
        });
        
        taskCompletionMessageRow.connect('changed', () => {
            this._settings.set_string('task-completion-message', taskCompletionMessageRow.get_text());
        });
        
        messagesGroup.add(taskCompletionMessageRow);

        // Tool Authorization Message
        const notificationHookMessageRow = new Adw.EntryRow({
            title: _('Tool Authorization Message'),
            text: this._settings.get_string('notification-hook-message') || 'Claude Code is waiting for input or has sent a notification.',
        });
        
        notificationHookMessageRow.connect('changed', () => {
            this._settings.set_string('notification-hook-message', notificationHookMessageRow.get_text());
        });
        
        messagesGroup.add(notificationHookMessageRow);

        preferencesPage.add(messagesGroup);
    }

    /**
     * 添加Telegram设置组
     * @param {Adw.PreferencesPage} preferencesPage 设置页面
     */
    _addTelegramSettingsGroup(preferencesPage) {
        const telegramGroup = new Adw.PreferencesGroup({
            title: _('Telegram Notifications'),
            description: _('Send notifications to Telegram bot'),
        });

        // Telegram 开关
        const telegramToggle = new Adw.SwitchRow({
            title: _('Enable Telegram Notifications'),
            subtitle: _('Send notifications to Telegram bot'),
        });
        
        this._settings.bind('telegram-enabled', telegramToggle, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        
        telegramGroup.add(telegramToggle);

        // Bot Token
        const botTokenRow = new Adw.PasswordEntryRow({
            title: _('Telegram Bot Token'),
            text: this._settings.get_string('telegram-bot-token'),
        });
        
        botTokenRow.connect('changed', () => {
            this._settings.set_string('telegram-bot-token', botTokenRow.get_text());
        });
        
        telegramGroup.add(botTokenRow);

        // Chat ID
        const chatIdRow = new Adw.EntryRow({
            title: _('Telegram Chat ID'),
            text: this._settings.get_string('telegram-chat-id'),
        });
        
        chatIdRow.connect('changed', () => {
            this._settings.set_string('telegram-chat-id', chatIdRow.get_text());
        });
        
        // 添加获取Chat ID帮助按钮
        const getChatIdButton = new Gtk.Button({
            icon_name: 'help-about-symbolic',
            tooltip_text: _('How to get Chat ID'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat']
        });
        getChatIdButton.connect('clicked', () => {
            this._showChatIdHelp();
        });
        chatIdRow.add_suffix(getChatIdButton);
        
        telegramGroup.add(chatIdRow);

        // 测试按钮
        const testRow = new Adw.ActionRow({
            title: _('Test Telegram Configuration'),
            subtitle: _('Send a test message to verify your Telegram settings'),
            activatable: true,
        });

        const testButton = new Gtk.Button({
            label: _('Send Test Message'),
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });

        testButton.connect('clicked', () => {
            this._testTelegramConfiguration(testButton);
        });

        testRow.add_suffix(testButton);
        telegramGroup.add(testRow);

        // 帮助信息
        const helpRow = new Adw.ActionRow({
            title: _('How to Setup Telegram Bot'),
            subtitle: _('1. Create bot with @BotFather\n2. Get your Chat ID from @userinfobot\n3. Enter both values above'),
        });
        
        const helpIcon = new Gtk.Image({
            icon_name: 'help-about-symbolic',
            css_classes: ['dim-label'],
        });
        helpRow.add_suffix(helpIcon);

        telegramGroup.add(helpRow);

        preferencesPage.add(telegramGroup);
    }

    /**
     * 添加通知行为设置组
     * @param {Adw.PreferencesPage} preferencesPage 设置页面
     */
    _addNotificationBehaviorGroup(preferencesPage) {
        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Notification Behavior'),
            description: _('Configure how notifications are displayed and behave'),
        });

        // 通知声音开关
        const soundToggle = new Adw.SwitchRow({
            title: _('Enable Notification Sound'),
            subtitle: _('Play sound when notifications are shown'),
        });
        
        this._settings.bind('notification-sound-enabled', soundToggle, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        
        behaviorGroup.add(soundToggle);

        // 自定义声音文件
        const soundFileRow = new Adw.ActionRow({
            title: _('Custom Sound File'),
            subtitle: _('Choose a custom sound file for notifications'),
            activatable: true,
        });

        const soundFileLabel = new Gtk.Label({
            label: this._settings.get_string('notification-sound-file') || _('Default system sound'),
            css_classes: ['dim-label'],
        });
        soundFileRow.add_suffix(soundFileLabel);

        soundFileRow.connect('activated', () => {
            this._showSoundFileChooser(soundFileLabel);
        });

        // 只有启用声音时才可选择文件
        this._settings.connect('changed::notification-sound-enabled', () => {
            soundFileRow.set_sensitive(this._settings.get_boolean('notification-sound-enabled'));
        });
        soundFileRow.set_sensitive(this._settings.get_boolean('notification-sound-enabled'));

        behaviorGroup.add(soundFileRow);

        // 通知紧急程度
        const urgencyRow = new Adw.ComboRow({
            title: _('Notification Urgency'),
            subtitle: _('Set the urgency level for notifications'),
        });

        const urgencyModel = new Gtk.StringList();
        urgencyModel.append(_('Low'));
        urgencyModel.append(_('Normal'));
        urgencyModel.append(_('Critical'));
        urgencyRow.set_model(urgencyModel);

        const currentUrgency = this._settings.get_string('notification-urgency');
        const urgencyIndex = ['low', 'normal', 'critical'].indexOf(currentUrgency);
        urgencyRow.set_selected(urgencyIndex >= 0 ? urgencyIndex : 1);

        urgencyRow.connect('notify::selected', () => {
            const urgencyValues = ['low', 'normal', 'critical'];
            this._settings.set_string('notification-urgency', urgencyValues[urgencyRow.get_selected()]);
        });

        behaviorGroup.add(urgencyRow);

        // 通知超时时间
        const timeoutRow = new Adw.SpinRow({
            title: _('Notification Timeout'),
            subtitle: _('Time in seconds before notification disappears (0 = no timeout)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
                value: this._settings.get_int('notification-timeout') / 1000,
            }),
        });

        timeoutRow.connect('changed', () => {
            this._settings.set_int('notification-timeout', timeoutRow.get_value() * 1000);
        });

        behaviorGroup.add(timeoutRow);

        preferencesPage.add(behaviorGroup);
    }


    /**
     * 显示声音文件选择器
     * @param {Gtk.Label} soundFileLabel 显示文件名的标签
     */
    _showSoundFileChooser(soundFileLabel) {
        const fileChooser = new Gtk.FileChooserDialog({
            title: _('Choose Sound File'),
            action: Gtk.FileChooserAction.OPEN,
            modal: true,
        });

        fileChooser.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        fileChooser.add_button(_('Open'), Gtk.ResponseType.ACCEPT);

        // 添加音频文件过滤器
        const audioFilter = new Gtk.FileFilter();
        audioFilter.set_name(_('Audio Files'));
        audioFilter.add_mime_type('audio/*');
        fileChooser.add_filter(audioFilter);

        const allFilter = new Gtk.FileFilter();
        allFilter.set_name(_('All Files'));
        allFilter.add_pattern('*');
        fileChooser.add_filter(allFilter);

        fileChooser.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.ACCEPT) {
                const file = dialog.get_file();
                const filePath = file.get_path();
                this._settings.set_string('notification-sound-file', filePath);
                soundFileLabel.set_label(file.get_basename());
            }
            dialog.destroy();
        });

        fileChooser.show();
    }

    /**
     * 测试Telegram配置
     * @param {Gtk.Button} testButton 测试按钮
     */
    _testTelegramConfiguration(testButton) {
        // 检查配置是否完整
        const botToken = this._settings.get_string('telegram-bot-token');
        const chatId = this._settings.get_string('telegram-chat-id');

        if (!botToken || !chatId || botToken.trim() === '' || chatId.trim() === '') {
            this._showTestResult(testButton, false, _('Please enter both Bot Token and Chat ID first'));
            return;
        }

        // 更新按钮状态
        testButton.set_label(_('Sending...'));
        testButton.set_sensitive(false);

        // 发送测试消息
        this._sendTelegramTestMessage(botToken, chatId, testButton);
    }

    /**
     * 发送Telegram测试消息 (优化版本)
     * @param {string} botToken Bot Token
     * @param {string} chatId Chat ID
     * @param {Gtk.Button} testButton 测试按钮
     */
    _sendTelegramTestMessage(botToken, chatId, testButton) {
        // 使用GLib.idle_add来异步处理，避免阻塞UI
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._performTelegramTest(botToken, chatId, testButton);
            return GLib.SOURCE_REMOVE;
        });
    }
    
    /**
     * 执行Telegram测试 (异步版本)
     * @param {string} botToken Bot Token
     * @param {string} chatId Chat ID
     * @param {Gtk.Button} testButton 测试按钮
     */
    async _performTelegramTest(botToken, chatId, testButton) {
        try {
            // 首先验证Bot Token
            const botInfo = await this._validateBotTokenAsync(botToken);
            if (botInfo) {
                // Bot Token有效，继续发送测试消息
                await this._sendActualTestMessageAsync(botToken, chatId, testButton, botInfo);
            }
        } catch (e) {
            this._showTestResult(testButton, false, _('Test failed: ') + e.message);
        }
    }

    /**
     * 异步验证Bot Token（使用Soup 3 API）
     * @param {string} botToken Bot Token
     * @returns {Promise<Object|null>} Bot信息或null
     */
    async _validateBotTokenAsync(botToken) {
        try {
            const getMeUrl = `https://api.telegram.org/bot${botToken}/getMe`;
            
            // 创建HTTP消息
            const msg = Soup.Message.new('GET', getMeUrl);
            if (!msg) {
                throw new Error('Failed to create HTTP message');
            }
            
            // 设置请求头
            const requestHeaders = msg.get_request_headers();
            requestHeaders.append('User-Agent', 'Claude-Code-Switcher/1.0');
            
            // 发送请求并等待响应
            const bytes = await new Promise((resolve, reject) => {
                this._soupSession.send_and_read_async(
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
            });
            
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
                return response.result;
            } else {
                throw new Error(_('Invalid Bot Token: ') + (response.description || 'Token无效'));
            }
            
        } catch (e) {
            throw new Error(_('Failed to validate Bot Token: ') + e.message);
        }
    }

    /**
     * 异步发送实际的测试消息（使用Soup 3 API）
     * @param {string} botToken Bot Token
     * @param {string} chatId Chat ID
     * @param {Gtk.Button} testButton 测试按钮
     * @param {Object} botInfo Bot信息
     */
    async _sendActualTestMessageAsync(botToken, chatId, testButton, botInfo) {
        try {
            const testMessage = `🧪 *测试消息*

这是来自 Claude Code Switcher 的测试消息。

🤖 Bot: ${botInfo.first_name} (@${botInfo.username})
💬 Chat ID: \`${chatId}\`
🕐 时间: ${new Date().toLocaleString('zh-CN')}

如果您收到此消息，说明 Telegram 通知配置成功！`;
            
            const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            
            const requestData = {
                chat_id: chatId,
                text: testMessage,
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
            
            // 发送请求并等待响应
            const bytes = await new Promise((resolve, reject) => {
                this._soupSession.send_and_read_async(
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
            });
            
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
                this._showTestResult(testButton, true,
                    _('Test message sent successfully!') + '\n\n' +
                    `Bot: ${botInfo.first_name}\n` +
                    `Chat ID: ${chatId}\n` +
                    `Message ID: ${response.result.message_id}\n\n` +
                    _('Please check your Telegram.')
                );
            } else {
                let errorMsg = response.description || 'Unknown error';
                if (response.error_code === 400 && errorMsg.includes('chat not found')) {
                    errorMsg += '\n\n💡 提示：\n1. 确保Chat ID正确\n2. 确保您已经与机器人开始对话\n3. 尝试先向机器人发送 /start 命令';
                }
                this._showTestResult(testButton, false, _('API Error: ') + errorMsg);
                throw new Error(errorMsg);
            }
            
        } catch (e) {
            this._showTestResult(testButton, false, _('Failed to send test message: ') + e.message);
            throw e;
        }
    }

    /**
     * 显示测试结果
     * @param {Gtk.Button} testButton 测试按钮
     * @param {boolean} success 是否成功
     * @param {string} message 结果消息
     */
    _showTestResult(testButton, success, message) {
        // 恢复按钮状态
        testButton.set_label(_('Send Test Message'));
        testButton.set_sensitive(true);

        // 显示结果对话框
        const dialog = new Adw.MessageDialog({
            heading: success ? _('Test Successful') : _('Test Failed'),
            body: message,
            modal: true,
        });

        dialog.add_response('ok', _('OK'));
        dialog.set_default_response('ok');
        dialog.set_close_response('ok');

        // 设置图标
        if (success) {
            dialog.add_css_class('success');
        } else {
            dialog.add_css_class('error');
        }

        dialog.present();
    }

    /**
     * 显示获取Chat ID的帮助信息
     */
    _showChatIdHelp() {
        const dialog = new Adw.MessageDialog({
            transient_for: this.get_root(),
            heading: _('How to get Telegram Chat ID'),
            body: _('Follow these steps to get your Chat ID:') + '\n\n' +
                  '1️⃣ ' + _('Start a conversation with your bot') + '\n' +
                  '2️⃣ ' + _('Send any message to the bot') + '\n' +
                  '3️⃣ ' + _('Open this URL in your browser:') + '\n' +
                  '   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates\n\n' +
                  '4️⃣ ' + _('Replace <YOUR_BOT_TOKEN> with your actual bot token') + '\n' +
                  '5️⃣ ' + _('Look for "chat":{"id":XXXXXXX} in the response') + '\n' +
                  '6️⃣ ' + _('Copy the number after "id": (this is your Chat ID)') + '\n\n' +
                  '💡 ' + _('Tip: If you see no messages, send another message to your bot and refresh the URL'),
            modal: true
        });

        dialog.add_response('close', _('Close'));
        dialog.set_default_response('close');
        dialog.set_close_response('close');

        // 添加复制URL按钮
        dialog.add_response('copy', _('Copy URL Template'));
        dialog.set_response_appearance('copy', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'copy') {
                const clipboard = this.get_display().get_clipboard();
                clipboard.set_text('https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates');
                
                // 显示复制成功的提示
                const toast = new Adw.Toast({
                    title: _('URL template copied to clipboard'),
                    timeout: 2
                });
                
                // 获取toast overlay
                let parent = this.get_parent();
                while (parent && !parent.add_toast) {
                    parent = parent.get_parent();
                }
                if (parent && parent.add_toast) {
                    parent.add_toast(toast);
                }
            }
            dialog.close();
        });

        dialog.present();
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        if (this._soupSession) {
            this._soupSession = null;
        }
    }
}