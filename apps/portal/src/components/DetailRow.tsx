export default function DetailRow({
  label,
  value,
  isLink = false,
}: {
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
        {label}
      </dt>
      <dd className="text-[14px] text-text">
        {isLink ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-light transition-colors break-all"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
