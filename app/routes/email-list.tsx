// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Pagination, Tooltip } from "@cloudflare/kumo";
import {
  ArchiveIcon,
  ArrowBendUpLeftIcon,
  ArrowsClockwiseIcon,
  EnvelopeOpenIcon,
  EnvelopeSimpleIcon,
  FileIcon,
  GearSixIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  StarIcon,
  TrashIcon,
  TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import SwipeableEmailRow from "~/components/SwipeableEmailRow";
import { getSnippetText } from "~/lib/utils";
import {
  useDeleteEmail,
  useEmails,
  useMarkThreadRead,
  useMoveEmail,
  useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import { useRealtime } from "~/hooks/useRealtime";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

const FOLDER_EMPTY_STATES: Record<
  string,
  {
    icon: React.ReactNode;
    title: string;
    description: string;
    showCompose?: boolean;
  }
> = {
  [Folders.INBOX]: {
    icon: <TrayIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "Your inbox is empty",
    description:
      "New emails will appear here when they arrive. Send an email to get the conversation started.",
    showCompose: true,
  },
  [Folders.SENT]: {
    icon: (
      <PaperPlaneTiltIcon
        size={48}
        weight="thin"
        className="text-kumo-subtle"
      />
    ),
    title: "No sent emails",
    description: "Emails you send will show up here.",
    showCompose: true,
  },
  [Folders.DRAFT]: {
    icon: <FileIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "No drafts",
    description: "Emails you're still working on will be saved here.",
    showCompose: true,
  },
  [Folders.ARCHIVE]: {
    icon: <ArchiveIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "Archive is empty",
    description:
      "Move emails here to keep your inbox clean without deleting them.",
  },
  [Folders.TRASH]: {
    icon: <TrashIcon size={48} weight="thin" className="text-kumo-subtle" />,
    title: "Trash is empty",
    description:
      "Deleted emails will appear here. You can restore them or permanently delete them.",
  },
};

function EmailListSkeleton() {
  return (
    <div className="animate-pulse space-y-1 p-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="w-4 h-4 rounded bg-kumo-fill" />
          <div className="w-5 h-5 rounded bg-kumo-fill" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-24 rounded bg-kumo-fill" />
              <div className="h-3 w-4 rounded bg-kumo-fill" />
              <div className="h-3 flex-1 rounded bg-kumo-fill" />
              <div className="h-3 w-12 rounded bg-kumo-fill" />
            </div>
            <div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FolderEmptyState({
  folder,
  onCompose,
}: {
  folder?: string;
  onCompose: () => void;
}) {
  const config = (folder && FOLDER_EMPTY_STATES[folder]) || {
    icon: (
      <EnvelopeSimpleIcon
        size={48}
        weight="thin"
        className="text-kumo-subtle"
      />
    ),
    title: "No emails",
    description: "This folder is empty.",
  };

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="mb-4">{config.icon}</div>
      <h3 className="text-base font-semibold text-kumo-default mb-1.5">
        {config.title}
      </h3>
      <p className="text-sm text-kumo-subtle max-w-xs mb-5">
        {config.description}
      </p>
      {"showCompose" in config && config.showCompose && (
        <Button
          variant="primary"
          size="sm"
          icon={<PencilSimpleIcon size={16} />}
          onClick={onCompose}
        >
          Compose
        </Button>
      )}
    </div>
  );
}

export default function EmailListRoute() {
  const { mailboxId, folder } = useParams<{
    mailboxId: string;
    folder: string;
  }>();
  const {
    selectedEmailId,
    isComposing,
    selectEmail,
    closePanel,
    startCompose,
  } = useUIStore();
  const [page, setPage] = useState(1);

  // Search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");
  const [sortDirection, setSortDirection] = useState<"DESC" | "ASC">("DESC");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter]);

  // Multi-select / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAllIds = () => {
    setSelectedIds(new Set(emails.map((e) => e.id)));
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
  };
  const exitSelectMode = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };
  // When search/filter/page changes, drop stale selections
  useEffect(() => {
    setSelectedIds(new Set());
  }, [folder, debouncedSearch, filter]);

  const queryClient = useQueryClient();
  // Real-time inbox: auto-refresh + notify when new mail arrives
  useRealtime(mailboxId);
  const updateEmail = useUpdateEmail();
  const moveEmailMut = useMoveEmail();
  const markThreadRead = useMarkThreadRead();
  const deleteEmail = useDeleteEmail();

  const params = useMemo(
    () => ({
      folder: folder || "",
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(filter === "unread" ? { unread: "true" } : {}),
      ...(filter === "starred" ? { starred: "true" } : {}),
      sortDirection,
    }),
    [folder, page, debouncedSearch, filter, sortDirection],
  );

  const { data: emailData, isFetching: isRefreshing } = useEmails(
    mailboxId,
    params,
    { refetchInterval: 30_000 },
  );

  const emails = emailData?.emails ?? [];
  const totalCount = emailData?.totalCount ?? 0;

  const { data: folders = [] } = useFolders(mailboxId);

  const folderName = useMemo(() => {
    const found = folders.find((f) => f.id === folder);
    if (found) return found.name;
    return folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "Inbox";
  }, [folders, folder]);

  const isPanelOpen = selectedEmailId !== null || isComposing;

  // Track folder identity to detect folder changes vs page changes
  const prevFolderRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
    prevFolderRef.current = `${mailboxId}/${folder}`;

    if (folderChanged) {
      closePanel();
      setPage(1);
    }
  }, [mailboxId, folder, closePanel]);

  const toggleStar = (e: React.MouseEvent, email: Email) => {
    e.preventDefault();
    e.stopPropagation();
    if (mailboxId)
      updateEmail.mutate({
        mailboxId,
        id: email.id,
        data: { starred: !email.starred },
      });
  };

  const isTrashFolder = folder === Folders.TRASH;

  const handleDelete = (e: React.MouseEvent, emailId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mailboxId) return;
    const confirmed = window.confirm(
      isTrashFolder
        ? "Permanently delete this email from Trash?"
        : "Move this email to Trash?",
    );
    if (!confirmed) return;
    if (isTrashFolder) {
      deleteEmail.mutate({ mailboxId, id: emailId });
    } else {
      moveEmailMut.mutate({ mailboxId, id: emailId, folderId: Folders.TRASH });
    }
    if (selectedEmailId === emailId) closePanel();
  };

  // Swipe actions (Gmail-style)
  const handleArchive = (email: Email) => {
    if (!mailboxId) return;
    moveEmailMut.mutate({ mailboxId, id: email.id, folderId: Folders.ARCHIVE });
    if (selectedEmailId === email.id) closePanel();
  };

  const handleReply = (email: Email) => {
    startCompose({ mode: "reply", originalEmail: email });
  };

  // Bulk delete: move to Trash (soft) unless already in Trash (permanent)
  const handleBulkDelete = () => {
    if (!mailboxId || selectedIds.size === 0) return;
    const count = selectedIds.size;
    const action = isTrashFolder ? "permanently delete" : "move to Trash";
    if (!window.confirm(`${action} ${count} selected email${count !== 1 ? "s" : ""}?`))
      return;
    for (const id of selectedIds) {
      if (isTrashFolder) deleteEmail.mutate({ mailboxId, id });
      else moveEmailMut.mutate({ mailboxId, id, folderId: Folders.TRASH });
      if (selectedEmailId === id) closePanel();
    }
    exitSelectMode();
  };

  // Row activation: in select mode we toggle, otherwise open the email
  const handleRowActivate = (email: Email) => {
    if (selectMode) {
      toggleSelect(email.id);
    } else {
      handleRowClick(email);
    }
  };

  const handleRefresh = () => {
    if (mailboxId) {
      queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.list(mailboxId),
      });
    }
  };

  // Thread-aware helpers
  const hasUnread = (email: Email): boolean => {
    if (email.thread_unread_count !== undefined) {
      return email.thread_unread_count > 0;
    }
    return !email.read;
  };

  const handleRowClick = (email: Email) => {
    selectEmail(email.id);
    if (mailboxId && hasUnread(email)) {
      if (email.thread_id && email.thread_count && email.thread_count > 1) {
        markThreadRead.mutate({
          mailboxId,
          threadId: email.thread_id,
        });
      } else {
        updateEmail.mutate({
          mailboxId,
          id: email.id,
          data: { read: true },
        });
      }
    }
  };

  const formatParticipants = (email: Email): string => {
    if (email.participants) {
      const names = email.participants
        .split(",")
        .map((p) => p.trim().split("@")[0])
        .filter((name, idx, arr) => arr.indexOf(name) === idx);
      if (names.length <= 3) return names.join(", ");
      return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    }
    return email.sender.split("@")[0];
  };

  const getInitials = (email: Email): string => {
    const name = formatParticipants(email)
      .split(/[\s.@_+]/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return name || "?";
  };

  const AVATAR_GRADIENTS = [
    "linear-gradient(135deg, #e05252, #c0392b)",
    "linear-gradient(135deg, #5294e0, #2980b9)",
    "linear-gradient(135deg, #52c07a, #27ae60)",
    "linear-gradient(135deg, #c8a44e, #a0833d)",
    "linear-gradient(135deg, #9b59b6, #8e44ad)",
    "linear-gradient(135deg, #e67e22, #d35400)",
    "linear-gradient(135deg, #1abc9c, #16a085)",
  ];

  const getAvatarGradient = (email: Email): string => {
    const src = email.sender || email.participants || email.id;
    let h = 0;
    for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
    return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  };

  return (
    <>
      <MailboxSplitView
        selectedEmailId={selectedEmailId}
        isComposing={isComposing}
      >
        {/* Folder header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
          <h1 className="text-lg font-semibold text-kumo-default">
            {folderName}
          </h1>
          <div className="flex items-center gap-1">
            {totalCount > 0 && (
              <span className="text-sm text-kumo-subtle mr-2 hidden sm:inline">
                {totalCount} conversation{totalCount !== 1 ? "s" : ""}
              </span>
            )}
            {!selectMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectMode(true)}
                disabled={emails.length === 0}
              >
                Select
              </Button>
            )}
            <Tooltip
              content={isRefreshing ? "Refreshing..." : "Refresh"}
              side="bottom"
              asChild
            >
              <Button
                variant="ghost"
                shape="square"
                size="sm"
                icon={
                  <ArrowsClockwiseIcon
                    size={18}
                    className={isRefreshing ? "animate-spin" : ""}
                  />
                }
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label="Refresh"
              />
            </Tooltip>
          </div>
        </div>

        {/* Bulk actions bar (select mode) */}
        {selectMode && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-kumo-line shrink-0 md:px-5">
            <span className="text-sm font-medium text-kumo-default">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={selectAllIds}
              className="rounded-full bg-kumo-fill px-2.5 py-1 text-[11px] font-medium text-kumo-subtle hover:text-kumo-default"
            >
              All
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
              className="rounded-full bg-kumo-fill px-2.5 py-1 text-[11px] font-medium text-kumo-subtle hover:text-kumo-default disabled:opacity-40"
            >
              Clear
            </button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                icon={<TrashIcon size={14} />}
                disabled={selectedIds.size === 0}
                onClick={handleBulkDelete}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Search & filters */}
        <div
          className={`${
            selectMode ? "hidden" : "flex"
          } items-center gap-2 px-4 py-2 border-b border-kumo-line shrink-0 md:px-5`}
        >
          <div className="relative flex-1">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search mail…"
              className="w-full rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-1.5 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-kumo-subtle hover:text-kumo-default"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilter(filter === "unread" ? "all" : "unread")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === "unread"
                ? "bg-kumo-brand text-kumo-recessed"
                : "bg-kumo-fill text-kumo-subtle hover:text-kumo-default"
            }`}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === "starred" ? "all" : "starred")}
            className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === "starred"
                ? "bg-kumo-brand text-kumo-recessed"
                : "bg-kumo-fill text-kumo-subtle hover:text-kumo-default"
            }`}
          >
            <StarIcon
              size={12}
              weight={filter === "starred" ? "fill" : "regular"}
            />
            Starred
          </button>
          <button
            type="button"
            onClick={() =>
              setSortDirection(sortDirection === "DESC" ? "ASC" : "DESC")
            }
            className="shrink-0 text-[11px] text-kumo-subtle hover:text-kumo-default"
            title="Toggle sort order"
          >
            {sortDirection === "DESC" ? "Newest" : "Oldest"}
          </button>
        </div>

        {/* Email rows */}
        <div className="flex-1 overflow-y-auto">
          {isRefreshing && emails.length === 0 ? (
            <EmailListSkeleton />
          ) : emails.length > 0 ? (
            <div>
              {emails.map((email) => {
                const isSelected = selectedEmailId === email.id;
                const snippet = getSnippetText(email.snippet);
                return (
                  <SwipeableEmailRow
                    key={email.id}
                    onOpen={() => handleRowActivate(email)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowActivate(email);
                      }
                    }}
                    rightActions={
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(email);
                          }}
                          className="flex-1 flex flex-col items-center justify-center gap-1 bg-kumo-info text-white text-[10px] uppercase tracking-wider border-0 cursor-pointer"
                        >
                          <ArchiveIcon size={20} />
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, email.id)}
                          className="flex-1 flex flex-col items-center justify-center gap-1 bg-kumo-danger text-white text-[10px] uppercase tracking-wider border-0 cursor-pointer"
                        >
                          <TrashIcon size={20} />
                          Delete
                        </button>
                      </>
                    }
                    leftActions={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReply(email);
                        }}
                        className="flex-1 flex flex-col items-center justify-center gap-1 bg-kumo-brand text-kumo-recessed text-[10px] uppercase tracking-wider border-0 cursor-pointer"
                      >
                        <ArrowBendUpLeftIcon size={20} />
                        Reply
                      </button>
                    }
                  >
                    <div
                      className={`group relative flex items-center gap-3 w-full text-left cursor-pointer transition-colors border-b border-kumo-line px-4 py-3 md:px-5 md:py-3.5 ${
                        isPanelOpen ? "md:px-4" : ""
                      } ${hasUnread(email) ? "bg-kumo-control" : ""} ${
                        isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint/60"
                      }`}
                    >
                      {/* Unread / selected accent bar */}
                      {(isSelected || hasUnread(email)) && (
                        <div
                          className={`absolute left-0 top-0 bottom-0 bg-kumo-brand ${
                            hasUnread(email) ? "w-[3px]" : "w-0.5"
                          }`}
                        />
                      )}
                      {selectMode && (
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-xs font-bold transition-colors ${
                            selectedIds.has(email.id)
                              ? "border-kumo-brand bg-kumo-brand text-kumo-recessed"
                              : "border-kumo-line text-transparent"
                          }`}
                          aria-hidden
                        >
                          ✓
                        </div>
                      )}

                      {/* Avatar */}
                      <div className="relative shrink-0 flex items-center justify-center">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-xs font-bold"
                          style={{
                            background: getAvatarGradient(email),
                            color: "#09090b",
                          }}
                        >
                          {getInitials(email)}
                        </div>
                        {hasUnread(email) && (
                          <span
                            className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 ${
                              isSelected
                                ? "border-kumo-tint"
                                : "border-kumo-base"
                            } bg-kumo-brand`}
                          />
                        )}
                      </div>

                      {/* Star */}
                      <button
                        type="button"
                        className="shrink-0 p-0.5 bg-transparent border-0 cursor-pointer rounded hover:bg-kumo-tint"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(e, email);
                        }}
                      >
                        <StarIcon
                          size={16}
                          weight={email.starred ? "fill" : "regular"}
                          className={
                            email.starred
                              ? "text-kumo-warning"
                              : "text-kumo-inactive hover:text-kumo-warning"
                          }
                        />
                      </button>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`truncate text-sm ${hasUnread(email) ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}
                          >
                            {formatParticipants(email)}
                          </span>
                          {(email.thread_count ?? 1) > 1 && (
                            <span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
                              {email.thread_count}
                            </span>
                          )}
                          {email.has_draft && (
                            <span className="shrink-0 text-xs text-kumo-destructive font-medium">
                              Draft
                            </span>
                          )}
                          {email.needs_reply && !email.has_draft && (
                            <Tooltip content="Needs reply" asChild>
                              <span className="shrink-0 text-kumo-warning">
                                <ArrowBendUpLeftIcon size={14} weight="bold" />
                              </span>
                            </Tooltip>
                          )}
                          <span className="text-sm text-kumo-subtle shrink-0 ml-auto">
                            {formatListDate(email.date)}
                          </span>
                        </div>
                        <div className="truncate text-sm mt-0.5">
                          <span
                            className={
                              hasUnread(email)
                                ? "font-medium text-kumo-default"
                                : "text-kumo-subtle"
                            }
                          >
                            {email.subject}
                          </span>
                          {snippet && (
                            <span className="text-kumo-subtle font-normal">
                              {" "}
                              &mdash; {snippet}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hover actions */}
                      <div className="hidden group-hover:flex items-center shrink-0">
                        <Tooltip
                          content={email.read ? "Mark unread" : "Mark read"}
                          asChild
                        >
                          <Button
                            variant="ghost"
                            shape="square"
                            size="sm"
                            icon={
                              email.read ? (
                                <EnvelopeSimpleIcon size={14} />
                              ) : (
                                <EnvelopeOpenIcon size={14} />
                              )
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mailboxId)
                                updateEmail.mutate({
                                  mailboxId,
                                  id: email.id,
                                  data: { read: !email.read },
                                });
                            }}
                            aria-label={
                              email.read ? "Mark unread" : "Mark read"
                            }
                          />
                        </Tooltip>
                        <Tooltip content="Delete" asChild>
                          <Button
                            variant="ghost"
                            shape="square"
                            size="sm"
                            icon={<TrashIcon size={14} />}
                            onClick={(e) => handleDelete(e, email.id)}
                            aria-label="Delete"
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </SwipeableEmailRow>
                );
              })}
            </div>
          ) : (
            <FolderEmptyState
              folder={folder}
              onCompose={() => startCompose()}
            />
          )}
        </div>

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex justify-center py-3 border-t border-kumo-line shrink-0">
            <Pagination
              page={page}
              setPage={setPage}
              perPage={PAGE_SIZE}
              totalCount={totalCount}
            />
          </div>
        )}
      </MailboxSplitView>

      {/* Compose FAB — mobile only (Vmail style) */}
      {!isPanelOpen && (
        <button
          type="button"
          onClick={() => startCompose()}
          aria-label="Compose"
          className="fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border-none cursor-pointer md:hidden"
          style={{
            background: "linear-gradient(135deg, #c8a44e, #a0833d)",
            boxShadow: "0 8px 24px rgba(200,164,78,0.25)",
            color: "#09090b",
          }}
        >
          <PencilSimpleIcon size={24} weight="bold" />
        </button>
      )}

      {/* Bottom nav — mobile only (Vmail style) */}
      {!isPanelOpen && (
        <MobileNav folder={folder} mailboxId={mailboxId ?? ""} />
      )}
    </>
  );
}

function MobileNav({
  folder,
  mailboxId,
}: {
  folder?: string;
  mailboxId: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    {
      key: "inbox",
      label: "Inbox",
      icon: TrayIcon,
      href: `/mailbox/${mailboxId}/emails/inbox`,
    },
    {
      key: "sent",
      label: "Sent",
      icon: PaperPlaneTiltIcon,
      href: `/mailbox/${mailboxId}/emails/sent`,
    },
    {
      key: "archive",
      label: "Archive",
      icon: ArchiveIcon,
      href: `/mailbox/${mailboxId}/emails/archive`,
    },
    {
      key: "settings",
      label: "Settings",
      icon: GearSixIcon,
      href: `/mailbox/${mailboxId}/settings`,
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex bg-kumo-base border-t border-kumo-line pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      {items.map((item) => {
        const active =
          item.key === "settings"
            ? location.pathname.endsWith("/settings")
            : folder === item.key;
        return (
          <button
            type="button"
            key={item.key}
            onClick={() => navigate(item.href)}
            className={
              "flex flex-1 flex-col items-center gap-1 py-2.5 border-none bg-transparent cursor-pointer " +
              (active ? "text-kumo-brand" : "text-kumo-inactive")
            }
          >
            <item.icon size={22} />
            <span className="text-[9px] uppercase tracking-wider">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
