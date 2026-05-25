import { elements } from "./elements.js";
import {
  loadStoredState,
  setBaseUrl,
  setUserId,
  syncSystemPromptInputState,
  state,
} from "./state.js";
import { toggleModal } from "./ui.js";
import { applyRootSettingsVisibility } from "./settings.js";
import { initEvents } from "./events.js";
import { fetchModelsIfAllowed, loadHistory, validateToken } from "./api.js";

async function bootstrap() {
  loadStoredState();
  setUserId(state.userId, state.userName);
  syncSystemPromptInputState();
  toggleModal(elements.settingsModal, false);
  applyRootSettingsVisibility();
  setBaseUrl(state.baseUrl);
  initEvents();
  const isValid = await validateToken();
  if (isValid) {
    fetchModelsIfAllowed();
    loadHistory();
    return;
  }
  window.location.href = "/login/login.html";
}

bootstrap();