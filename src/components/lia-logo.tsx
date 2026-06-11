type LiaLogoProps = {
  size?: number;
  animated?: boolean;
  rectFill?: string;
  showBackground?: boolean;
};

export function LiaLogo({ size = 130, animated = true, rectFill = "#161628", showBackground = true }: LiaLogoProps) {
  return (
    <svg
      viewBox="0 0 399.84 399.84"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="LIA"
    >
      {animated && (
        <style>{`
          .lia-shine1{stroke-dasharray:180 420;animation:lia-shine1 5s linear infinite;}
          .lia-shine2{stroke-dasharray:180 420;animation:lia-shine2 5s linear infinite 2.5s;}
          .lia-shine-cross{stroke-dasharray:120 380;animation:lia-shine-cross 5s linear infinite 1.2s;}
          .lia-dot1{animation:lia-pulse-dot 5s ease-in-out infinite;}
          .lia-dot2{animation:lia-pulse-dot 5s ease-in-out infinite 2.5s;}
          @keyframes lia-shine1{from{stroke-dashoffset:600;}to{stroke-dashoffset:-600;}}
          @keyframes lia-shine2{from{stroke-dashoffset:600;}to{stroke-dashoffset:-600;}}
          @keyframes lia-shine-cross{from{stroke-dashoffset:500;}to{stroke-dashoffset:-500;}}
          @keyframes lia-pulse-dot{0%,100%{r:12.3;opacity:.7;}50%{r:15.5;opacity:1;}}
        `}</style>
      )}
      {showBackground && <rect width="399.84" height="399.84" rx="90" ry="90" fill={rectFill} />}

      {animated ? (
        <>
          <path d="M199.7,200.03s-40.72-56.45-84.86-56.45-72.49,56.45-72.49,56.45c0,0,26.1,56.31,70.88,56.31s86.47-56.31,86.47-56.31Z" fill="none" stroke="#818cf8" strokeWidth="9" strokeMiterlimit="10" opacity="0.3" />
          <path d="M200.04,200.09s40.72-56.45,84.86-56.45c44.14,0,72.49,56.45,72.49,56.45,0,0-26.1,56.31-70.88,56.31s-86.47-56.31-86.47-56.31Z" fill="none" stroke="#818cf8" strokeWidth="9" strokeMiterlimit="10" opacity="0.3" />
          <path d="M42.35,200.03s51.07-55.94,158.48.44c106.82,56.07,156.56-.38,156.56-.38" fill="none" stroke="#484aab" strokeWidth="5" strokeMiterlimit="10" opacity="0.3" />
          <path className="lia-shine1" d="M199.7,200.03s-40.72-56.45-84.86-56.45-72.49,56.45-72.49,56.45c0,0,26.1,56.31,70.88,56.31s86.47-56.31,86.47-56.31Z" fill="none" stroke="#a5b4fc" strokeWidth="9" strokeMiterlimit="10" />
          <path className="lia-shine2" d="M200.04,200.09s40.72-56.45,84.86-56.45c44.14,0,72.49,56.45,72.49,56.45,0,0-26.1,56.31-70.88,56.31s-86.47-56.31-86.47-56.31Z" fill="none" stroke="#a5b4fc" strokeWidth="9" strokeMiterlimit="10" />
          <path className="lia-shine-cross" d="M42.35,200.03s51.07-55.94,158.48.44c106.82,56.07,156.56-.38,156.56-.38" fill="none" stroke="#818cf8" strokeWidth="5" strokeMiterlimit="10" />
          <circle className="lia-dot1" cx="42.35" cy="199.96" r="12.3" fill="#a5b4fc" />
          <circle className="lia-dot2" cx="357.39" cy="200.03" r="12.3" fill="#a5b4fc" />
        </>
      ) : (
        <>
          <path d="M199.7,200.03s-40.72-56.45-84.86-56.45-72.49,56.45-72.49,56.45c0,0,26.1,56.31,70.88,56.31s86.47-56.31,86.47-56.31Z" fill="none" stroke="#818cf8" strokeWidth="9" strokeMiterlimit="10" />
          <path d="M200.04,200.09s40.72-56.45,84.86-56.45c44.14,0,72.49,56.45,72.49,56.45,0,0-26.1,56.31-70.88,56.31s-86.47-56.31-86.47-56.31Z" fill="none" stroke="#818cf8" strokeWidth="9" strokeMiterlimit="10" />
          <path d="M42.35,200.03s51.07-55.94,158.48.44c106.82,56.07,156.56-.38,156.56-.38" fill="none" stroke="#484aab" strokeWidth="5" strokeMiterlimit="10" />
          <circle cx="42.35" cy="199.96" r="12.3" fill="#a5b4fc" />
          <circle cx="357.39" cy="200.03" r="12.3" fill="#a5b4fc" />
        </>
      )}
    </svg>
  );
}
