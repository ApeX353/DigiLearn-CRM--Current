import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Calendar, Phone, Mail, Clock, Users } from "lucide-react";
import type { School } from "~/api/schools";
import { type Activity } from "~/api/activities";

interface ActivitiesTabProps {
  school: School;
}

export function ActivitiesTab({ school: _school }: ActivitiesTabProps) {
  void _school;
  // TODO: Fetch activities from API when endpoint is available
  const activities: Activity[] = [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No activities recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Activities such as visits, calls, emails, and meetings will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity: any, index: number) => (
                <div
                  key={index}
                  className="flex gap-4 p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {activity.type === "call" && (
                      <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                        <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                    {activity.type === "email" && (
                      <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
                        <Mail className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                    )}
                    {activity.type === "meeting" && (
                      <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                        <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                    )}
                    {activity.type === "visit" && (
                      <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900">
                        <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium">{activity.title}</h4>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {activity.date}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-indigo-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Visits</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Phone className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Mail className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Emails</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-muted-foreground">Meetings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
