import { buildCanvasCommand, type CanvasCommand } from "./command-bridge.js";

export type CanvasKeyboardScope = Readonly<{
  isCanvasFocused: () => boolean;
  isTextInputFocused: () => boolean;
}>;

export function createCanvasKeyboardHandler(
  emit: (command: CanvasCommand) => void,
  scope: CanvasKeyboardScope,
): (event: Pick<KeyboardEvent, "key" | "preventDefault">) => void {
  return (event) => {
    if (!scope.isCanvasFocused() || scope.isTextInputFocused()) {
      return;
    }
    if (event.key === "Tab") {
      return;
    }
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      emit(buildCanvasCommand.quickCreate("keyboard"));
    }
    if (event.key.toLowerCase() === "g") {
      event.preventDefault();
      emit(buildCanvasCommand.openGenerationConfirmation("keyboard"));
    }
  };
}
