/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('Claude Code Switcher'));
        this._extension = extension;
        this._settings = extension.getSettings();

        this.add_child(new St.Icon({
            icon_name: 'face-smile-symbolic',
            style_class: 'system-status-icon',
        }));

        // 构建菜单
        this._buildMenu();

        // 监听设置变化
        this._settings.connect('changed::api-providers', () => {
            this._rebuildMenu();
        });
        this._settings.connect('changed::current-provider', () => {
            this._updateCurrentProvider();
        });
    }

    _buildMenu() {
        // 清空现有菜单
        this.menu.removeAll();

        // 添加API提供商列表
        this._addProviderMenuItems();

        // 添加分隔符
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 添加"Add more.."按钮
        let addMoreItem = new PopupMenu.PopupMenuItem(_('Add more..'));
        addMoreItem.connect('activate', () => {
            this._openPreferences();
        });
        this.menu.addMenuItem(addMoreItem);
    }

    _addProviderMenuItems() {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProvider = this._settings.get_string('current-provider');

            if (providers.length === 0) {
                // 如果没有配置提供商，显示提示
                let noProvidersItem = new PopupMenu.PopupMenuItem(_('暂无配置的提供商'));
                noProvidersItem.setSensitive(false);
                this.menu.addMenuItem(noProvidersItem);
                return;
            }

            // 为每个提供商创建菜单项
            providers.forEach(provider => {
                let item = new PopupMenu.PopupMenuItem(provider.name);
                
                // 如果是当前选中的提供商，添加勾选标记
                if (provider.name === currentProvider) {
                    item.setOrnament(PopupMenu.Ornament.CHECK);
                }

                item.connect('activate', () => {
                    this._selectProvider(provider.name);
                });

                this.menu.addMenuItem(item);
            });
        } catch (e) {
            console.log('加载API提供商失败:', e);
            let errorItem = new PopupMenu.PopupMenuItem(_('加载提供商失败'));
            errorItem.setSensitive(false);
            this.menu.addMenuItem(errorItem);
        }
    }

    _selectProvider(providerName) {
        // 检查提供商是否有API密钥
        if (this._checkProviderKey(providerName)) {
            this._settings.set_string('current-provider', providerName);
            Main.notify(_(`已切换到: ${providerName}`));
        } else {
            // 显示配置API密钥的提示
            this._showConfigureKeyNotification(providerName);
        }
    }

    _checkProviderKey(providerName) {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const provider = providers.find(p => p.name === providerName);
            return provider && provider.key && provider.key.trim() !== '';
        } catch (e) {
            console.log('检查API密钥失败:', e);
            return false;
        }
    }

    _showConfigureKeyNotification(providerName) {
        if (providerName.includes('Anthropic') || providerName.includes('默认')) {
            Main.notify(_('请先配置 Anthropic API 密钥'), _('点击"Add more.."按钮打开设置界面，为 Anthropic 提供商配置官方 API 密钥后即可使用。'));
        } else {
            Main.notify(_(`请先配置 ${providerName} API 密钥`), _('点击"Add more.."按钮打开设置界面，为此提供商配置 API 密钥后即可使用。'));
        }
    }

    _rebuildMenu() {
        this._buildMenu();
    }

    _updateCurrentProvider() {
        // 重新构建菜单以更新勾选状态
        this._rebuildMenu();
    }

    _openPreferences() {
        if (this._extension && this._extension.openPreferences) {
            this._extension.openPreferences();
        }
    }
});

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
