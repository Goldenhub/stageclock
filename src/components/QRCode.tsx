import { QRCodeSVG } from "qrcode.react";

interface Props {
  url: string;
  size?: number;
}

export function QRCode({ url, size = 160 }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white p-3 rounded-xl">
        <QRCodeSVG value={url} size={size} />
      </div>
      <p className="text-xs text-gray-400 font-mono break-all text-center max-w-xs">
        {url}
      </p>
    </div>
  );
}
