const KEY = "tandanji_guest_mode";

export const guest = {
  enable: () => {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, "1");
  },
  disable: () => {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(KEY);
  },
  isEnabled: (): boolean => {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(KEY) === "1";
  },
};
