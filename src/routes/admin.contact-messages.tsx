import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Eye,
  Mail,
  MailCheck,
  MailQuestion,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/site/Section";
import { formatMessageDate, type ContactMessage } from "@/lib/contact";
import { supabase } from "@/lib/supabase";
import {
  deleteContactMessage,
  fetchContactMessages,
  updateContactMessageReadStatus,
} from "@/services/api";

export const Route = createFileRoute("/admin/contact-messages")({
  head: () => ({
    meta: [
      { title: "Contact Messages — Rekik Café Admin" },
      {
        name: "description",
        content: "Messages submitted through the public website",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminContactMessagesPage,
});

function AdminContactMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name-asc" | "name-desc">("recent");

  // Selection & Details state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Deletion confirmation state
  const [messageToDelete, setMessageToDelete] = useState<ContactMessage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch data
  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const fetched = await fetchContactMessages(token ? { token } : undefined);
      setMessages(fetched);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load contact messages";
      console.error("[admin] Error loading contact messages:", err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      if (isManual) {
        setRefreshing(false);
        toast.success("Messages synced");
      }
    }
  };

  useEffect(() => {
    void loadData();

    // Set up Realtime Supabase updates
    const channel = supabase
      .channel("admin-contact-messages-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contact_messages" },
        (payload: { eventType: string; new: { name?: string } }) => {
          if (payload.eventType === "INSERT") {
            toast.info(`New contact message received from ${payload.new?.name || "a visitor"}!`, {
              icon: "✉️",
            });
          }
          void loadData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Compute metrics from real database data
  const totalCount = messages.length;
  const unreadCount = useMemo(() => messages.filter((m) => !m.is_read).length, [messages]);
  const readCount = useMemo(() => messages.filter((m) => m.is_read).length, [messages]);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Status filter
      if (statusFilter === "unread" && msg.is_read) return false;
      if (statusFilter === "read" && !msg.is_read) return false;

      // Search query (name, email, message)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = msg.name.toLowerCase().includes(query);
        const matchesEmail = msg.email.toLowerCase().includes(query);
        const matchesContent = msg.message.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesContent) {
          return false;
        }
      }

      return true;
    });
  }, [messages, statusFilter, searchQuery]);

  // Sort messages (newest first by default)
  const sortedMessages = useMemo(() => {
    return [...filteredMessages].sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
  }, [filteredMessages, sortBy]);

  const selectedMessage = useMemo(() => {
    return messages.find((m) => m.id === selectedMessageId) || null;
  }, [messages, selectedMessageId]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortBy("recent");
  };

  const isFiltered = searchQuery.trim() !== "" || statusFilter !== "all" || sortBy !== "recent";

  // Actions
  const handleToggleReadStatus = async (msg: ContactMessage, nextRead: boolean) => {
    setUpdatingId(msg.id);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const updated = await updateContactMessageReadStatus(
        msg.id,
        nextRead,
        token ? { token } : undefined,
      );

      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, is_read: updated.is_read } : m)),
      );
      toast.success(nextRead ? "Marked as read" : "Marked as unread");
    } catch (err: unknown) {
      const msgError = err instanceof Error ? err.message : "Failed to update message";
      toast.error(msgError);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!messageToDelete) return;
    setIsDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      await deleteContactMessage(messageToDelete.id, token ? { token } : undefined);

      setMessages((prev) => prev.filter((m) => m.id !== messageToDelete.id));
      if (selectedMessageId === messageToDelete.id) {
        setIsDetailOpen(false);
        setSelectedMessageId(null);
      }
      toast.success("Contact message deleted");
      setMessageToDelete(null);
    } catch (err: unknown) {
      const msgError = err instanceof Error ? err.message : "Failed to delete message";
      toast.error(msgError);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. HEADER */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Contact Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Messages submitted through the public website
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing || loading}
            className="gap-2 h-9 text-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Syncing…" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      {/* 2. METRICS CARDS */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Total Messages */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Messages
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">{totalCount}</p>
          <p className="text-xs text-muted-foreground">
            {totalCount === 1 ? "Message recorded" : "Messages recorded"} in database
          </p>
        </div>

        {/* Unread Messages */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Unread Messages
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <MailQuestion className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">{unreadCount}</p>
          <p className="text-xs text-muted-foreground">Awaiting review from staff</p>
        </div>

        {/* Read Messages */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-success">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Read Messages
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <MailCheck className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">{readCount}</p>
          <p className="text-xs text-muted-foreground">Reviewed and archived</p>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS */}
      <div className="surface-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search by sender name, email, or message content…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              aria-label="Search messages"
            />
          </div>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(val: "all" | "unread" | "read") => setStatusFilter(val)}
          >
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by read status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Messages</SelectItem>
              <SelectItem value="unread">Unread Only</SelectItem>
              <SelectItem value="read">Read Only</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Filter */}
          <Select
            value={sortBy}
            onValueChange={(val: "recent" | "oldest" | "name-asc" | "name-desc") => setSortBy(val)}
          >
            <SelectTrigger className="h-9 text-sm" aria-label="Sort messages">
              <SelectValue placeholder="Sort order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name-asc">Sender (A–Z)</SelectItem>
              <SelectItem value="name-desc">Sender (Z–A)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Secondary row: status count & reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
            <span>
              Showing <strong>{sortedMessages.length}</strong> of <strong>{messages.length}</strong>{" "}
              messages
            </span>
          </div>

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
              onClick={resetFilters}
            >
              <RotateCcw className="size-3" aria-hidden />
              Reset filters
            </Button>
          )}
        </div>
      </div>

      {/* 4. MESSAGES TABLE */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading contact messages from Supabase…</p>
        </div>
      ) : error ? (
        <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Failed to load contact messages
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : sortedMessages.length === 0 ? (
        <div className="surface-card p-12">
          {isFiltered ? (
            <EmptyState
              title="No messages match your filters"
              description="Try adjusting your search query or status filter to see more messages."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No contact messages yet"
              description="Messages submitted by visitors through the website contact form will appear here."
            />
          )}
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Name</TableHead>
                  <TableHead className="w-[200px]">Email</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[160px]">Submitted</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMessages.map((msg) => {
                  const isUpdating = updatingId === msg.id;
                  return (
                    <TableRow
                      key={msg.id}
                      className={`cursor-pointer transition-colors ${
                        !msg.is_read ? "bg-primary/[0.02] font-medium" : "opacity-90"
                      }`}
                      onClick={() => {
                        setSelectedMessageId(msg.id);
                        setIsDetailOpen(true);
                      }}
                    >
                      {/* Name */}
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {!msg.is_read && (
                            <span
                              className="size-2 rounded-full bg-primary shrink-0"
                              title="Unread message"
                              aria-label="Unread message"
                            />
                          )}
                          <span className="truncate">{msg.name}</span>
                        </div>
                      </TableCell>

                      {/* Email */}
                      <TableCell className="text-muted-foreground">
                        <a
                          href={`mailto:${msg.email}`}
                          className="hover:underline hover:text-primary truncate block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {msg.email}
                        </a>
                      </TableCell>

                      {/* Message Preview */}
                      <TableCell className="max-w-[320px]">
                        <p className="truncate text-sm text-muted-foreground" title={msg.message}>
                          {msg.message}
                        </p>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {msg.is_read ? (
                          <Badge
                            variant="outline"
                            className="inline-flex items-center gap-1 bg-muted text-muted-foreground border-border text-xs py-0.5 px-2"
                          >
                            <CheckCircle2 className="size-3" aria-hidden />
                            <span>Read</span>
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="inline-flex items-center gap-1 bg-primary/10 text-primary border-primary/20 font-semibold text-xs py-0.5 px-2"
                          >
                            <Clock className="size-3" aria-hidden />
                            <span>Unread</span>
                          </Badge>
                        )}
                      </TableCell>

                      {/* Submitted */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatMessageDate(msg.created_at)}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* View details */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title="View full message"
                            aria-label="View full message"
                            onClick={() => {
                              setSelectedMessageId(msg.id);
                              setIsDetailOpen(true);
                            }}
                          >
                            <Eye className="size-4" />
                          </Button>

                          {/* Quick read/unread toggle */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            disabled={isUpdating}
                            title={msg.is_read ? "Mark as unread" : "Mark as read"}
                            aria-label={msg.is_read ? "Mark as unread" : "Mark as read"}
                            onClick={() => void handleToggleReadStatus(msg, !msg.is_read)}
                          >
                            {msg.is_read ? (
                              <MailQuestion className="size-4" />
                            ) : (
                              <MailCheck className="size-4 text-primary" />
                            )}
                          </Button>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            title="Delete message"
                            aria-label="Delete message"
                            onClick={() => setMessageToDelete(msg)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* 5. MESSAGE DETAILS SHEET */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedMessage && (
            <div className="space-y-6">
              <SheetHeader className="text-left space-y-1 pb-4 border-b">
                <div className="flex items-center justify-between gap-2">
                  <SheetTitle className="font-display text-xl">Message Details</SheetTitle>
                  {selectedMessage.is_read ? (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs"
                    >
                      <CheckCircle2 className="size-3" />
                      Read
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary font-semibold text-xs"
                    >
                      <Clock className="size-3" />
                      Unread
                    </Badge>
                  )}
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  Submitted {formatMessageDate(selectedMessage.created_at)}
                </SheetDescription>
              </SheetHeader>

              {/* Sender & Contact */}
              <div className="space-y-4">
                <div className="surface-card p-4 space-y-3 bg-muted/30">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sender
                    </label>
                    <p className="font-medium text-foreground text-sm mt-0.5">
                      {selectedMessage.name}
                    </p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Email
                    </label>
                    <p className="text-sm mt-0.5">
                      <a
                        href={`mailto:${selectedMessage.email}`}
                        className="text-primary hover:underline"
                      >
                        {selectedMessage.email}
                      </a>
                    </p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Submitted Date
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatMessageDate(selectedMessage.created_at)}
                    </p>
                  </div>
                </div>

                {/* Message Body */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Full Message
                  </label>
                  <div className="surface-card p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap min-h-[120px] bg-background border">
                    {selectedMessage.message}
                  </div>
                </div>
              </div>

              {/* Sheet Actions */}
              <div className="pt-4 border-t space-y-2">
                <Button
                  variant="outline"
                  className="w-full gap-2 justify-center"
                  disabled={updatingId === selectedMessage.id}
                  onClick={() =>
                    void handleToggleReadStatus(selectedMessage, !selectedMessage.is_read)
                  }
                >
                  {selectedMessage.is_read ? (
                    <>
                      <MailQuestion className="size-4" />
                      Mark as Unread
                    </>
                  ) : (
                    <>
                      <MailCheck className="size-4 text-primary" />
                      Mark as Read
                    </>
                  )}
                </Button>

                <Button
                  variant="destructive"
                  className="w-full gap-2 justify-center"
                  onClick={() => setMessageToDelete(selectedMessage)}
                >
                  <Trash2 className="size-4" />
                  Delete Message
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 6. DELETE CONFIRMATION DIALOG */}
      <AlertDialog
        open={Boolean(messageToDelete)}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact Message?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the message from{" "}
              <strong>{messageToDelete?.name}</strong> ({messageToDelete?.email})? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
