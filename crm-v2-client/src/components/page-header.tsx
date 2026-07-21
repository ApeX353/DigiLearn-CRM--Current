import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "./ui/button";

interface PageHeaderProps {
  hasBackButton?: boolean;
  backButtonComponent?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  onBack?: () => void;
}

const PageHeader = ({
  title,
  subtitle,
  actions,
  hasBackButton = false,
  backButtonComponent,
  onBack
}: PageHeaderProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const TitleComp = title ? (
    typeof title === "string" ? (
      <h3 className="font-semibold text-lg">{title}</h3>
    ) : (
      title
    )
  ) : null;
  const SubtitleComp = subtitle ? (
    typeof subtitle === "string" ? (
      <p className="text-muted-foreground text-sm">{subtitle}</p>
    ) : (
      subtitle
    )
  ) : null;

  return (
    <div className="w-full border-b border-border">
      <div className="container relative mx-auto">
        <div className="relative z-2 flex items-center p-4">
          {hasBackButton && (
            <div className="mr-4">
              {backButtonComponent || (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <div>
            {TitleComp}
            {SubtitleComp}
          </div>
          <div className="ml-auto">{actions && actions}</div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
