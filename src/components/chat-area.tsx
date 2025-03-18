"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Copy, Download, ThumbsUp, ThumbsDown, X, Wand2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Message } from "@/components/chat-interface"
import type { AIModel } from "@/lib/api"

interface ChatAreaProps {
  conversation: Message[]
  isTyping: boolean
  customerName: string
  onSendMessage: (content: string) => void
  onImprovePrompt: (content: string) => Promise<string>
  onReaction: (messageId: string, type: "like" | "dislike") => void
  onSaveConversation: () => void
  onCloseConversation: () => void
  inputValue: string
  setInputValue: (value: string) => void
  selectedModel: AIModel
  setSelectedModel: (model: AIModel) => void
}

export function ChatArea({
  conversation,
  isTyping,
  customerName,
  onSendMessage,
  onImprovePrompt,
  onReaction,
  onSaveConversation,
  onCloseConversation,
  inputValue,
  setInputValue,
  selectedModel,
  setSelectedModel,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isImproving, setIsImproving] = useState(false)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversation, isTyping])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSendMessage(inputValue)
  }

  const handleCopyMessage = (content: string) => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        alert("Message copied to clipboard")
      })
      .catch((err) => {
        console.error("Could not copy text: ", err)
      })
  }

  const handleDownloadMessage = (content: string) => {
    const element = document.createElement("a")
    const file = new Blob([content], { type: "text/plain" })
    element.href = URL.createObjectURL(file)
    element.download = "message.txt"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const handleImprovePrompt = async () => {
    if (!inputValue.trim()) return

    setIsImproving(true)
    try {
      const improvedPrompt = await onImprovePrompt(inputValue)
      setInputValue(improvedPrompt)
    } catch (error) {
      console.error("Error improving prompt:", error)
    } finally {
      setIsImproving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full border-r border-gray-200">
      {/* Chat header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Voice conversation</span>
        </div>
        <div className="flex items-center gap-4">
          <select
            title="Select AI model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as AIModel)}
            className="text-sm border rounded-md py-1 px-2 bg-white border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="deepseek-r1:70b">deepseek-r1:70b</option>
            <option value="llama3.2-vision">llama3.2-vision</option>
          </select>
          <Button variant="outline" size="sm" onClick={onSaveConversation} className="transition-all hover:bg-blue-50">
            Save conversation
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseConversation}
            className="transition-all hover:bg-red-50 hover:text-red-500"
          >
            <X size={18} />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {conversation.map((message) => (
          <div key={message.id} className="space-y-1 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-blue-600">
                {message.sender === "agent" ? "GenerativeAgent" : customerName}
              </span>
              <span className="text-xs text-gray-500">{message.timestamp}</span>
            </div>

            <div className="whitespace-pre-line">{message.content}</div>

            <div className="flex gap-2 mt-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-all hover:bg-gray-100"
                onClick={() => handleCopyMessage(message.content)}
              >
                <Copy size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-all hover:bg-gray-100"
                onClick={() => handleDownloadMessage(message.content)}
              >
                <Download size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-all hover:bg-gray-100"
                onClick={() => onReaction(message.id, "like")}
              >
                <ThumbsUp size={16} className={message.reactions.likes > 0 ? "text-blue-600" : ""} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-all hover:bg-gray-100"
                onClick={() => onReaction(message.id, "dislike")}
              >
                <ThumbsDown size={16} className={message.reactions.dislikes > 0 ? "text-red-600" : ""} />
              </Button>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="space-y-1 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-blue-600">GenerativeAgent</span>
              <span className="text-xs text-gray-500">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              className="flex-1 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Type a message as a customer"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isTyping}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleImprovePrompt}
              disabled={isTyping || isImproving || !inputValue.trim()}
              title="Improve prompt"
              className="bg-white border-gray-300 hover:bg-blue-50 transition-all"
            >
              {isImproving ? (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              ) : (
                <Wand2 className="h-5 w-5 text-blue-600" />
              )}
            </Button>
          </div>
          <Button
            type="submit"
            disabled={isTyping || !inputValue.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white transition-all"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}

