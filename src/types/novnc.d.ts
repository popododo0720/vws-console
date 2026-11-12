/** The part of noVNC's RFB class the console uses (the package's docs/API.md); the package ships no types. */
declare module "@novnc/novnc" {
  type RfbEvents = {
    connect: CustomEvent<Record<string, never>>;
    disconnect: CustomEvent<{ clean: boolean }>;
    credentialsrequired: CustomEvent<{ types: string[] }>;
    securityfailure: CustomEvent<{ status: number; reason?: string }>;
  };

  export default class RFB {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket);
    scaleViewport: boolean;
    background: string;
    addEventListener<K extends keyof RfbEvents>(type: K, listener: (event: RfbEvents[K]) => void): void;
    disconnect(): void;
    focus(): void;
  }
}
