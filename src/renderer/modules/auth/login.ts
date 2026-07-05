const SESSION_KEY = "habaneros-manager-authenticated";
const MANAGER_PASSWORD = "92118";

interface LoginElements {
  screen: HTMLElement;
  form: HTMLFormElement;
  password: HTMLInputElement;
  error: HTMLElement;
}

export function requireManagerLogin(elements: LoginElements, onAuthenticated: () => void): void {
  const unlock = () => {
    document.body.classList.remove("login-locked");
    elements.screen.hidden = true;
    onAuthenticated();
  };

  if (sessionStorage.getItem(SESSION_KEY) === "true") {
    unlock();
    return;
  }

  document.body.classList.add("login-locked");
  elements.screen.hidden = false;
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (elements.password.value !== MANAGER_PASSWORD) {
      elements.error.textContent = "Incorrect password. Please try again.";
      elements.password.select();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "true");
    elements.error.textContent = "";
    elements.password.value = "";
    unlock();
  });
  queueMicrotask(() => elements.password.focus());
}
