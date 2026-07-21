import { useLogout } from "~/api";
import { useAuthStore } from "~/stores/use-auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import {
  ChevronsUpDown,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { useNavigate } from "react-router";

export const UserButton = ({ showLogin = false }: { showLogin?: boolean }) => {
  const logout = useLogout();
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const handleLogout = async () => {
    logout.mutateAsync();
  };

  if (!user && showLogin) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-full" variant="outline">
            <LogIn className="h-4 w-4 ml-2" /> Login
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60">
          <DropdownMenuItem onClick={() => navigate("/login?portal=sms")}>
            SMS Portal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/login?portal=lms")}>
            LMS Portal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!user && !showLogin) {
    return null;
  }

  return (
    user && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-full" variant="outline">
            {/* <User className="h-4 w-4 mr-2" /> */}
            <span>
              {`${user.first_name} ${user.last_name}`
                .split(" ")
                .map((n) => n.charAt(0))}
            </span>
            <ChevronsUpDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <p>
                {user.first_name} {user.last_name}
              </p>
              <p className="font-light text-muted-foreground text-sm">
                {user.email}
              </p>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate("/profile")}>
            <User className="h-4 w-4 mr-2" /> Profile
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive hover:text-destructive! hover:bg-transparent! [&>svg]:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  );
};
