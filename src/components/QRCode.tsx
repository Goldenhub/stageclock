import { QRCodeSVG } from "qrcode.react";

interface Props {
  url: string;
  size?: number;
  showUrl?: boolean;
}

export function QRCode({ url, size = 160, showUrl = true }: Props) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="rounded-2xl bg-white p-3.5 shadow-lg shadow-black/40">
        <QRCodeSVG value={url} size={size} />
      </div>
      {showUrl && (
        <p className="select-all break-all text-center font-mono text-xs text-zinc-400">{url}</p>
      )}
    </div>
  );
}
