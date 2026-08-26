import { Link } from "react-router";

export function BackToLogin({ showExtraText }: { showExtraText?: boolean }) {
  return (
    <div className="text-center flex items-center gap-x-2 justify-center">
      {showExtraText && (
        <p className="text-muted-foreground">Remember Password?</p>
      )}
      <Link to="/login" className="text-primary">
        Back to Login
      </Link>
    </div>
  );
}
