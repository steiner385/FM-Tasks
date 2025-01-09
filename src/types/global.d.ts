declare global {
  interface ErrorConstructor {
    captureStackTrace?(error: Error, constructor: Function): void;
  }
}

export {};
