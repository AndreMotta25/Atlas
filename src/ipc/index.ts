import { registerFileHandlers } from './file_handlers';
import { registerShellHandlers } from './shell_handlers';
import { registerWindowHandlers } from './window_handlers';
import { registerAppHandlers } from './app_handlers';
import { registerThemeHandlers } from './theme_handlers';
import { registerCredentialHandlers } from './credentials_handlers';
import { registerNotificationHandlers } from './notification_handlers';
import { registerVaultHandlers } from './vault_handlers';
import { registerSettingsHandlers } from './settings_handlers';
import { registerAIHandlers } from './ai_handlers';
import { registerToolHandlers } from './tool_handlers';
import { registerSearchHandlers } from './search_handlers';

export const registerAllHandlers = (): void => {
  registerFileHandlers();
  registerShellHandlers();
  registerWindowHandlers();
  registerAppHandlers();
  registerThemeHandlers();
  registerCredentialHandlers();
  registerNotificationHandlers();
  registerVaultHandlers();
  registerSettingsHandlers();
  registerAIHandlers();
  registerToolHandlers();
  registerSearchHandlers();
};
