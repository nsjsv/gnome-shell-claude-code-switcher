import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * 全局设置组件
 * 负责创建和管理全局扩展设置界面
 */
export class GlobalSettingsGroup {
    constructor(settings, settingsManager) {
        this._settings = settings;
        this.settingsManager = settingsManager;
    }

    /**
     * 创建全局设置组
     * @returns {Adw.PreferencesGroup} 全局设置组
     */
    createGlobalSettingsGroup() {
        const globalGroup = new Adw.PreferencesGroup({
            title: _('Global Settings'),
            description: _('Configure global extension options'),
        });

        // 自动更新开关
        const autoUpdateRow = new Adw.SwitchRow({
            title: _('Auto Update'),
            subtitle: _('Enable automatic updates for the extension'),
        });
        globalGroup.add(autoUpdateRow);

        this._settings.bind('auto-update', autoUpdateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // 代理设置
        this._setupProxySettings(globalGroup);

        // 清空配置按钮
        this._setupClearConfigButton(globalGroup);

        return globalGroup;
    }

    /**
     * 设置代理设置UI
     * @param {Adw.PreferencesGroup} globalGroup 全局设置组
     */
    _setupProxySettings(globalGroup) {
        const proxyRow = new Adw.ExpanderRow({
            title: _('Proxy Settings'),
            subtitle: _('Configure network proxy server'),
        });
        globalGroup.add(proxyRow);

        // 延迟创建代理内容以提升性能
        let proxyContentCreated = false;
        proxyRow.connect('notify::expanded', () => {
            if (proxyRow.expanded && !proxyContentCreated) {
                this._createProxyContent(proxyRow);
                proxyContentCreated = true;
            }
        });
        
        // 初始化代理展开行的副标题
        const {host, port} = this.settingsManager.getProxyInfo();
        if (host && port) {
            proxyRow.set_subtitle(_('Configured: ') + host + ':' + port);
        } else if (host) {
            proxyRow.set_subtitle(_('Configured: ') + host);
        }
    }

    /**
     * 创建代理设置内容
     * @param {Adw.ExpanderRow} proxyRow 代理设置展开行
     */
    _createProxyContent(proxyRow) {
        const {host, port} = this.settingsManager.getProxyInfo();

        // 代理主机输入
        const proxyHostRow = new Adw.EntryRow({
            title: _('Proxy Server'),
            text: host,
        });
        proxyRow.add_row(proxyHostRow);

        // 代理端口输入
        const proxyPortRow = new Adw.EntryRow({
            title: _('Port'),
            text: port,
        });
        proxyRow.add_row(proxyPortRow);

        // 代理设置操作按钮
        const proxyActionRow = new Adw.ActionRow({
            title: _('Actions'),
        });

        const proxyButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
        });

        const proxyCancelButton = new Gtk.Button({
            label: _('Cancel'),
            css_classes: ['flat'],
        });

        const proxySaveButton = new Gtk.Button({
            label: _('Save'),
            css_classes: ['suggested-action'],
        });

        proxyButtonBox.append(proxyCancelButton);
        proxyButtonBox.append(proxySaveButton);
        proxyActionRow.add_suffix(proxyButtonBox);
        proxyRow.add_row(proxyActionRow);

        // 保存原始值
        const originalValues = {host, port};

        // 取消按钮逻辑
        proxyCancelButton.connect('clicked', () => {
            proxyHostRow.set_text(originalValues.host);
            proxyPortRow.set_text(originalValues.port);
            proxyRow.set_expanded(false);
        });

        // 保存按钮逻辑
        proxySaveButton.connect('clicked', () => {
            const newHost = proxyHostRow.get_text();
            const newPort = proxyPortRow.get_text();

            this.settingsManager.setProxy(newHost, newPort);
            
            originalValues.host = newHost;
            originalValues.port = newPort;
            
            if (newHost && newPort) {
                proxyRow.set_subtitle(_('Configured: ') + newHost + ':' + newPort);
            } else if (newHost) {
                proxyRow.set_subtitle(_('Configured: ') + newHost);
            } else {
                proxyRow.set_subtitle(_('Configure network proxy server'));
            }
            
            proxyRow.set_expanded(false);
            console.log('Saved proxy settings: ' + newHost + ':' + newPort);
        });
    }

    /**
     * 设置清空配置按钮
     * @param {Adw.PreferencesGroup} globalGroup 全局设置组
     */
    _setupClearConfigButton(globalGroup) {
        const clearConfigRow = new Adw.ActionRow({
            title: _('Clear Configuration'),
            subtitle: _('Reset Claude settings.json to empty state'),
        });

        const clearButton = new Gtk.Button({
            label: _('Clear Config'),
            css_classes: ['destructive-action'],
            valign: Gtk.Align.CENTER,
        });

        clearButton.connect('clicked', () => {
            this._showClearConfigDialog();
        });

        clearConfigRow.add_suffix(clearButton);
        globalGroup.add(clearConfigRow);
    }

    /**
     * 显示清空配置确认对话框
     */
    _showClearConfigDialog() {
        const dialog = new Adw.MessageDialog({
            heading: _('Clear Configuration'),
            body: _('This will clear the Claude settings.json file to an empty state. All current configuration will be lost. Are you sure you want to continue?'),
            modal: true,
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('clear', _('Clear Config'));
        dialog.set_response_appearance('clear', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', (dialog, response) => {
            if (response === 'clear') {
                this._performClearConfig();
            }
            dialog.close();
        });

        // 获取当前窗口作为父窗口
        const topLevel = this._getTopLevelWindow();
        if (topLevel) {
            dialog.set_transient_for(topLevel);
        }

        dialog.present();
    }

    /**
     * 执行清空配置操作
     */
    _performClearConfig() {
        const success = this.settingsManager.clearClaudeConfig();
        
        if (success) {
            this._showSuccessDialog();
        } else {
            this._showErrorDialog();
        }
    }

    /**
     * 显示成功对话框
     */
    _showSuccessDialog() {
        const dialog = new Adw.MessageDialog({
            heading: _('Configuration Cleared'),
            body: _('Claude settings.json has been successfully cleared to empty state.'),
            modal: true,
        });

        dialog.add_response('ok', _('OK'));
        dialog.set_default_response('ok');
        dialog.set_close_response('ok');

        const topLevel = this._getTopLevelWindow();
        if (topLevel) {
            dialog.set_transient_for(topLevel);
        }

        dialog.present();
    }

    /**
     * 显示错误对话框
     */
    _showErrorDialog() {
        const dialog = new Adw.MessageDialog({
            heading: _('Error'),
            body: _('Failed to clear Claude configuration. Please check the console for more details.'),
            modal: true,
        });

        dialog.add_response('ok', _('OK'));
        dialog.set_default_response('ok');
        dialog.set_close_response('ok');

        const topLevel = this._getTopLevelWindow();
        if (topLevel) {
            dialog.set_transient_for(topLevel);
        }

        dialog.present();
    }

    /**
     * 获取顶级窗口
     */
    _getTopLevelWindow() {
        // 尝试从设置中获取窗口引用
        if (this._settings && this._settings.get_parent) {
            let widget = this._settings;
            while (widget && widget.get_parent) {
                const parent = widget.get_parent();
                if (!parent) break;
                widget = parent;
                if (widget instanceof Adw.PreferencesWindow || widget instanceof Gtk.Window) {
                    return widget;
                }
            }
        }
        return null;
    }
}