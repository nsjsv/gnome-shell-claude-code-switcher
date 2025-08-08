import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * 通知设置组件
 * 负责创建和管理Claude Code hooks通知设置界面
 */
export class NotificationsGroup {
    constructor(settings) {
        this._settings = settings;
    }

    /**
     * 创建通知设置组
     * @returns {Adw.PreferencesGroup} 通知设置组
     */
    createNotificationsGroup() {
        const notificationsGroup = new Adw.PreferencesGroup({
            title: _('Notifications'),
            description: _('Configure Claude Code hooks notifications'),
        });

        // 通知主开关（使用 ExpanderRow 实现展开/折叠）
        const notificationsToggle = new Adw.ExpanderRow({
            title: _('Enable Notifications'),
            subtitle: _('Enable Claude Code hooks notifications'),
            show_enable_switch: true,
        });
        notificationsGroup.add(notificationsToggle);

        // 绑定主开关到设置
        this._settings.bind('notifications-enabled', notificationsToggle, 'enable_expansion',
            Gio.SettingsBindFlags.DEFAULT);

        // 添加钩子事件开关
        this._addHookEventSwitches(notificationsToggle);

        return notificationsGroup;
    }

    /**
     * 添加钩子事件开关
     * @param {Adw.ExpanderRow} notificationsToggle 通知主开关展开行
     */
    _addHookEventSwitches(notificationsToggle) {
        const hookEvents = [
            {
                key: 'normal-exit',
                title: _('Normal Exit Notifications'),
                subtitle: _('Show notifications when Claude Code exits normally (exit code 0)'),
            },
            {
                key: 'abnormal-exit',
                title: _('Abnormal Exit Notifications'),
                subtitle: _('Show notifications when Claude Code exits abnormally (non-zero exit codes)'),
            },
        ];

        hookEvents.forEach(hook => {
            const switchRow = new Adw.SwitchRow({
                title: hook.title,
                subtitle: hook.subtitle,
            });
            
            this._settings.bind(`hook-${hook.key}`, switchRow, 'active',
                Gio.SettingsBindFlags.DEFAULT);
            
            notificationsToggle.add_row(switchRow);
        });
    }
}