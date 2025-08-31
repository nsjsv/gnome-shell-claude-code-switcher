import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * @class NotificationsGroup
 * @description Creates and manages the "Notifications" section in the preferences window.
 */
export class NotificationsGroup {
    /**
     * @param {Gio.Settings} settings - The GSettings object.
     * @param {SettingsManager} settingsManager - The settings manager instance.
     */
    constructor(settings, settingsManager) {
        this._settings = settings;
        this._settingsManager = settingsManager;
    }

    /**
     * 创建通知设置组
     * @returns {Adw.PreferencesGroup} 通知设置组
     */
    createNotificationsGroup() {
        const notificationsGroup = new Adw.PreferencesGroup({
            title: _('Notifications'),
            description: _(
                'Get notified when Claude Code tasks complete or need attention'
            ),
        });

        // 通知主开关（使用 ExpanderRow 实现展开/折叠）
        const notificationsToggle = new Adw.ExpanderRow({
            title: _('Enable Notifications'),
            subtitle: _('Get desktop notifications for Claude Code events'),
            show_enable_switch: true,
        });
        notificationsGroup.add(notificationsToggle);

        // 绑定主开关到设置
        this._settings.bind(
            'notifications-enabled',
            notificationsToggle,
            'enable_expansion',
            Gio.SettingsBindFlags.DEFAULT
        );

        // 监听主开关变化并同步到配置文件
        this._settings.connect('changed::notifications-enabled', () => {
            this._syncSettings();
        });

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
            subtitle: _(
                'Show notifications when Claude Code completes tasks or encounters issues'
            ),
        });

        this._settings.bind(
            'hook-task-completion',
            taskCompletionRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        // 监听任务完成通知开关变化
        this._settings.connect('changed::hook-task-completion', () => {
            this._syncSettings();
        });

        notificationsToggle.add_row(taskCompletionRow);

        // Tool Authorization Notifications
        const toolAuthRow = new Adw.SwitchRow({
            title: _('Tool Authorization Notifications'),
            subtitle: _(
                'Show notifications when Claude Code uses tools (PreToolUse/PostToolUse)'
            ),
        });

        this._settings.bind(
            'hook-tool-auth',
            toolAuthRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        // 监听工具授权通知开关变化
        this._settings.connect('changed::hook-tool-auth', () => {
            this._syncSettings();
        });

        notificationsToggle.add_row(toolAuthRow);
    }

    /**
     * 添加高级设置按钮
     * @param {Adw.ExpanderRow} notificationsToggle 通知主开关展开行
     */
    _addAdvancedSettingsButton(notificationsToggle) {
        const advancedRow = new Adw.ActionRow({
            title: _('Advanced Settings'),
            subtitle: _(
                'Customize notification messages and setup external notifications'
            ),
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
            text:
                this._settings.get_string('task-completion-message') ||
                'Claude Code task completed.',
        });

        taskCompletionMessageRow.connect('changed', () => {
            this._settings.set_string(
                'task-completion-message',
                taskCompletionMessageRow.get_text()
            );
        });

        messagesGroup.add(taskCompletionMessageRow);

        // Tool Authorization Message
        const toolAuthMessageRow = new Adw.EntryRow({
            title: _('Tool Authorization Message'),
            text:
                this._settings.get_string('tool-auth-message') ||
                'Claude Code tool authorization event triggered.',
        });

        toolAuthMessageRow.connect('changed', () => {
            this._settings.set_string(
                'tool-auth-message',
                toolAuthMessageRow.get_text()
            );
        });

        messagesGroup.add(toolAuthMessageRow);

        preferencesPage.add(messagesGroup);
    }

    /**
     * 显示声音文件选择器
     * @param {Gtk.Label} soundFileLabel 显示文件名的标签
     */
    _addNotificationBehaviorGroup(preferencesPage) {
        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Notification Behavior'),
            description: _(
                'Configure how notifications are displayed and behave'
            ),
        });

        // 通知声音开关
        const soundToggle = new Adw.SwitchRow({
            title: _('Enable Notification Sound'),
            subtitle: _('Play sound when notifications are shown'),
        });

        this._settings.bind(
            'notification-sound-enabled',
            soundToggle,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        behaviorGroup.add(soundToggle);

        // 自定义声音文件
        const soundFileRow = new Adw.ActionRow({
            title: _('Custom Sound File'),
            subtitle: _('Choose a custom sound file for notifications'),
            activatable: true,
        });

        const soundFileLabel = new Gtk.Label({
            label:
                this._settings.get_string('notification-sound-file') ||
                _('Default system sound'),
            css_classes: ['dim-label'],
        });
        soundFileRow.add_suffix(soundFileLabel);

        soundFileRow.connect('activated', () => {
            this._showSoundFileChooser(soundFileLabel);
        });

        // 只有启用声音时才可选择文件
        this._settings.connect('changed::notification-sound-enabled', () => {
            soundFileRow.set_sensitive(
                this._settings.get_boolean('notification-sound-enabled')
            );
        });
        soundFileRow.set_sensitive(
            this._settings.get_boolean('notification-sound-enabled')
        );

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

        const currentUrgency = this._settings.get_string(
            'notification-urgency'
        );
        const urgencyIndex = ['low', 'normal', 'critical'].indexOf(
            currentUrgency
        );
        urgencyRow.set_selected(urgencyIndex >= 0 ? urgencyIndex : 1);

        urgencyRow.connect('notify::selected', () => {
            const urgencyValues = ['low', 'normal', 'critical'];
            this._settings.set_string(
                'notification-urgency',
                urgencyValues[urgencyRow.get_selected()]
            );
        });

        behaviorGroup.add(urgencyRow);

        // 通知超时时间
        const timeoutRow = new Adw.SpinRow({
            title: _('Notification Timeout'),
            subtitle: _(
                'Time in seconds before notification disappears (0 = no timeout)'
            ),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
                value: this._settings.get_int('notification-timeout') / 1000,
            }),
        });

        timeoutRow.connect('changed', () => {
            this._settings.set_int(
                'notification-timeout',
                timeoutRow.get_value() * 1000
            );
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
     * 同步设置到配置文件
     */
    _syncSettings() {
        if (this._settingsManager) {
            // 异步同步，避免阻塞UI
            this._settingsManager.syncToLocalFile().catch((error) => {
                console.error('Failed to sync notification settings:', error);
            });
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        // 资源清理已完成
    }
}
