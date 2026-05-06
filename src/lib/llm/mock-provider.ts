import { generateDesignMarkdown } from "@/lib/generator/design-md";
import type { DesignMarkdownProvider } from "./types";

export const mockDesignMarkdownProvider: DesignMarkdownProvider = {
  complete({ analysis }) {
    return Promise.resolve(generateDesignMarkdown(analysis));
  }
};
