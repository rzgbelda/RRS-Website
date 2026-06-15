import Link from "next/link";
import Image from "next/image";

interface LogoProps {
  variant?: "text" | "image";
  href?: string;
}

export default function Logo({ variant = "text", href = "/" }: LogoProps) {
  const content =
    variant === "image" ? (
      <Image src="/assets/RR logo.png" alt="Room Ready Supply" width={180} height={60} style={{ height: "auto" }} />
    ) : (
      <>
        <div className="logo-rr" aria-hidden="true">
          <span className="blue-r">R</span>
          <span className="orange-r">R</span>
        </div>
        <div className="logo-text">
          <h2>Room Ready</h2>
          <p>SUPPLY</p>
        </div>
      </>
    );

  return (
    <Link href={href} className="logo" aria-label="Room Ready Supply — home">
      {content}
    </Link>
  );
}
