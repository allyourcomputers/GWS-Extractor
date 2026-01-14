import { action } from "../_generated/server";
import { v } from "convex/values";

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
}

export const listMessages = action({
  args: {
    accessToken: v.string(),
    labelId: v.string(),
    afterTimestamp: v.optional(v.number()),
    pageToken: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    let query = `in:${args.labelId}`;
    if (args.afterTimestamp) {
      const date = new Date(args.afterTimestamp);
      const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
      query += ` after:${dateStr}`;
    }

    const params = new URLSearchParams({
      q: query,
      maxResults: "100",
    });

    if (args.pageToken) {
      params.set("pageToken", args.pageToken);
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${error}`);
    }

    const data = await response.json();

    return {
      messages: (data.messages || []) as GmailMessage[],
      nextPageToken: data.nextPageToken as string | undefined,
    };
  },
});

export const getMessage = action({
  args: {
    accessToken: v.string(),
    messageId: v.string(),
  },
  handler: async (_ctx, args) => {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.messageId}?format=metadata&metadataHeaders=From`,
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${error}`);
    }

    const data: GmailMessageDetail = await response.json();

    const fromHeader = data.payload.headers.find(
      (h) => h.name.toLowerCase() === "from"
    );

    return {
      id: data.id,
      timestamp: parseInt(data.internalDate, 10),
      from: fromHeader?.value || "",
    };
  },
});

export const listLabels = action({
  args: { accessToken: v.string() },
  handler: async (_ctx, args) => {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${error}`);
    }

    const data = await response.json();

    return data.labels as Array<{ id: string; name: string; type: string }>;
  },
});
