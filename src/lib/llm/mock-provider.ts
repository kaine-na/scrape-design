import { generateDesignMarkdown } from "@/lib/generator/design-md";
import type { DesignMarkdownProvider } from "./types";

export const mockDesignMarkdownProvider: DesignMarkdownProvider = {
  async complete({ analysis }) {
    return generateDesignMarkdown(analysis);
  }
};
