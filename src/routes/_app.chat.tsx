import { createFileRoute } from "@tanstack/react-router";
import { ChatInterface } from "@/components/alfred/chat-interface";

export const Route = createFileRoute("/_app/chat")({
  component: () => <ChatInterface />,
});
