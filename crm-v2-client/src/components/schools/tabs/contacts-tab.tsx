import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Plus, User, Phone, Mail, UserLock } from "lucide-react";
import type { School } from "~/api/schools";

interface ContactsTabProps {
  school: School;
}

export function ContactsTab({ school }: ContactsTabProps) {
  const contacts = school.contacts || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">School Contacts</CardTitle>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">
                No contacts added yet
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Add contacts for teachers, administrators, or other staff
                members
              </p>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Contact
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contacts.map((contact) => (
                <Card
                  key={contact.id}
                  className="hover:bg-accent/50 transition-colors"
                >
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-primary/10">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold">
                              {contact.first_name} {contact.last_name}
                            </p>
                            {contact.role && (
                              <Badge variant="secondary" className="mt-1">
                                {contact.role}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {contact.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{contact.phone}</span>
                        </div>
                      )}

                      {contact.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-primary hover:underline"
                          >
                            {contact.email}
                          </a>
                        </div>
                      )}

                      {contact.role && (
                        <div className="flex items-center gap-2 text-sm">
                          <UserLock className="h-4 w-4 text-muted-foreground" />
                          <span>{contact.role}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <User className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{contacts.length}</p>
                <p className="text-sm text-muted-foreground">Total Contacts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Mail className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">
                  {contacts.filter((c) => c.email).length}
                </p>
                <p className="text-sm text-muted-foreground">With Email</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Phone className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">
                  {contacts.filter((c) => c.phone).length}
                </p>
                <p className="text-sm text-muted-foreground">With Phone</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
