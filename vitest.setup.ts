import { Window } from "happy-dom";

const window = new Window();
const document = window.document;

Object.assign(globalThis, {
  window,
  document,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
  StorageEvent: window.StorageEvent,
  CustomEvent: window.CustomEvent,
});
