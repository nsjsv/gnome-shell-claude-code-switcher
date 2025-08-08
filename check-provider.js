#!/usr/bin/env gjs

// Claude Code Switcher Hook Script
// 检查当前provider配置状态并返回相应的退出代码

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

// 获取扩展设置
function getSettings() {
    const schemaId = 'org.gnome.shell.extensions.claude-code-switcher';
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
        GLib.build_filenamev([GLib.get_home_dir(), '.local/share/gnome-shell/extensions/claude-code-switcher@nsjsv.github.io/schemas']),
        Gio.SettingsSchemaSource.get_default(),
        false
    );
    
    const schema = schemaSource.lookup(schemaId, false);
    if (!schema) {
        print('Claude Code Switcher: Failed to load settings schema');
        return null;
    }
    
    return new Gio.Settings({ settings_schema: schema });
}

// 显示通知
function showNotification(title, message, icon = 'dialog-warning') {
    try {
        const proc = Gio.Subprocess.new(
            ['notify-send', title, message, '-i', icon],
            Gio.SubprocessFlags.NONE
        );
        proc.wait(null);
    } catch (e) {
        print(`Failed to show notification: ${e}`);
    }
}

// 主函数
function main() {
    try {
        const settings = getSettings();
        if (!settings) {
            showNotification('Claude Code Switcher', '❌ Failed to load settings', 'dialog-error');
            return 1;
        }
        
        // 获取当前provider
        const currentProvider = settings.get_string('current-provider');
        
        if (!currentProvider || currentProvider === 'null' || currentProvider === '') {
            // 没有配置provider
            print('Claude Code Switcher: No provider configured');
            showNotification(
                'Claude Code Switcher', 
                '⚠️ No API provider configured. Please configure a provider first.',
                'dialog-warning'
            );
            return 1;
        }
        
        // 获取provider列表
        const providersJson = settings.get_string('api-providers');
        let providers = [];
        
        try {
            providers = JSON.parse(providersJson);
        } catch (e) {
            print('Claude Code Switcher: Failed to parse providers');
            showNotification('Claude Code Switcher', '❌ Invalid provider configuration', 'dialog-error');
            return 1;
        }
        
        // 查找当前provider
        const provider = providers.find(p => p.name === currentProvider);
        
        if (!provider) {
            print(`Claude Code Switcher: Provider '${currentProvider}' not found`);
            showNotification(
                'Claude Code Switcher',
                `❌ Provider '${currentProvider}' not found`,
                'dialog-error'
            );
            return 1;
        }
        
        // 检查API密钥
        if (!provider.key || provider.key.trim() === '') {
            print(`Claude Code Switcher: Provider '${currentProvider}' has no API key`);
            showNotification(
                'Claude Code Switcher',
                `⚠️ Provider '${currentProvider}' is missing API key`,
                'dialog-warning'
            );
            return 1;
        }
        
        // 一切正常
        print(`Claude Code Switcher: Using provider '${currentProvider}'`);
        return 0;
        
    } catch (e) {
        print(`Claude Code Switcher: Error - ${e}`);
        showNotification('Claude Code Switcher', `❌ Error: ${e.message}`, 'dialog-error');
        return 1;
    }
}

// 执行主函数并退出
const exitCode = main();
if (typeof System !== 'undefined') {
    System.exit(exitCode);
} else {
    // 旧版本GJS
    imports.system.exit(exitCode);
}