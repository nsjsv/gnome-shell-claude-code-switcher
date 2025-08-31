export const DBUS_NAME = 'org.gnome.shell.extensions.claude_code_switcher';
export const DBUS_PATH = '/org/gnome/shell/extensions/claude_code_switcher';

export const DBUS_INTERFACE = `
<node>
    <interface name="${DBUS_NAME}">
        <method name="ShowNotification">
            <arg type="s" name="notificationType" direction="in"/>
        </method>
    </interface>
</node>`;