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
  CalendarDays,
  ChevronsUpDown,
  LogIn,
  LogOut,
  Mail,
  User,
  Video,
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
          <DropdownMenuItem onClick={() => navigate("/profile/email-accounts")}>
            <Mail className="h-4 w-4 mr-2" /> Email accounts
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate("/profile/calendar-connections")}
          >
            <CalendarDays className="h-4 w-4 mr-2" /> Calendar sync
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate("/profile/video-connections")}
          >
            <Video className="h-4 w-4 mr-2" /> Video conferencing
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
