import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClaudeCodeSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // 创建主设置页面
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // 创建API提供商配置组
        const providersGroup = new Adw.PreferencesGroup({
            title: _('API 提供商'),
            description: _('配置 Claude Code API 提供商'),
        });
        page.add(providersGroup);

        // 添加示例设置项
        const showIndicatorRow = new Adw.SwitchRow({
            title: _('显示面板指示器'),
            subtitle: _('是否在面板中显示指示器'),
        });
        providersGroup.add(showIndicatorRow);

        // 添加API设置组
        const apiGroup = new Adw.PreferencesGroup({
            title: _('API 设置'),
            description: _('配置 API 端点和密钥'),
        });
        page.add(apiGroup);

        // API端点输入框
        const apiEndpointRow = new Adw.EntryRow({
            title: _('API 端点'),
            text: 'https://api.anthropic.com',
        });
        apiGroup.add(apiEndpointRow);

        // API密钥输入框
        const apiKeyRow = new Adw.PasswordEntryRow({
            title: _('API 密钥'),
        });
        apiGroup.add(apiKeyRow);

        // 关于组
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('关于'),
        });
        page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: _('Claude Code Switcher'),
            subtitle: _('快速切换 Claude Code API 提供商'),
        });
        aboutGroup.add(aboutRow);
    }
}