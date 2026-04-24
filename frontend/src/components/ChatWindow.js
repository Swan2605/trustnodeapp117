import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { resolveImageUrl } from '../utils/imageUrl';
import '../styles/chat.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const socket = io(API_BASE);

const ChatWindow = ({ profile }) => {
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('token');
  const currentUserId = profile?._id;

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Join socket room when user is logged in
  useEffect(() => {
    if (currentUserId) {
      socket.emit('join-conversation', currentUserId);
    }

    const handleReceiveMessage = (data) => {
      if (selectedUserId && (data.from === selectedUserId || data.from === currentUserId)) {
        setMessages(prev => [...prev, {
          ...data,
          message: data.message
        }]);
      }
    };

    socket.on('receive-message', handleReceiveMessage);

    return () => socket.off('receive-message', handleReceiveMessage);
  }, [selectedUserId, currentUserId]);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/chat`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConversations(res.data);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  const fetchMessages = async (userId) => {
    try {
      setLoading(true);
      setSelectedUserId(userId);
      setMessages([]);

      // Fetch messages
      const res = await axios.get(`${API_BASE}/api/chat/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMessages(res.data);

      // Mark as read
      await axios.patch(
        `${API_BASE}/api/chat/read`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedUserId) return;

    try {
      // Send via REST API
      const response = await axios.post(
        `${API_BASE}/api/chat/send`,
        {
          to: selectedUserId,
          message: messageText
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Optimistically add message to display
      setMessages(prev => [...prev, {
        ...response.data,
        timestamp: new Date()
      }]);

      // Notify via Socket
      socket.emit('send-message', {
        _id: response.data._id,
        from: currentUserId,
        to: selectedUserId,
        message: messageText,
        timestamp: response.data.timestamp
      });

      setMessageText('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  };

  const searchConnections = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const res = await axios.get(`${API_BASE}/api/profile/search?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(res.data.results.filter(user => user.isFriend));
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const startConversation = (userId) => {
    setSearchQuery('');
    setSearchResults([]);
    fetchMessages(userId);
  };

  const selectedConversation = conversations.find(c => c._id === selectedUserId);

  return (
    <div className="chat-window">
      <div className="chat-sidebar">
        <h2>Messages</h2>

        <div className="chat-search">
          <input
            type="text"
            placeholder="Search connections..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchConnections(e.target.value);
            }}
            className="search-input"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map(user => (
              <div
                key={user._id}
                className="search-result-item"
                onClick={() => startConversation(user._id)}
              >
                <img
                  src={resolveImageUrl(user.profile?.avatar || '/images/default-avatar.png')}
                  alt={user.username}
                  className="avatar-small"
                />
                <span>{user.username}</span>
              </div>
            ))}
          </div>
        )}

        <div className="conversations-list">
          {conversations.length === 0 ? (
            <p className="empty-state">No conversations yet. Search to start one!</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv._id}
                className={`conversation-item ${selectedUserId === conv._id ? 'active' : ''}`}
                onClick={() => fetchMessages(conv._id)}
              >
                <img
                  src={resolveImageUrl(conv.avatar || '/images/default-avatar.png')}
                  alt={conv.username}
                  className="avatar-small"
                />
                <div className="conversation-info">
                  <h4>{conv.username}</h4>
                  <p className="last-message">Last message: {new Date(conv.lastMessageTime).toLocaleDateString()}</p>
                  {conv.unreadCount > 0 && (
                    <span className="unread-badge">{conv.unreadCount}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="chat-main">
        {selectedUserId ? (
          <>
            <div className="chat-header">
              {selectedConversation && (
                <>
                  <img
                    src={resolveImageUrl(selectedConversation.avatar || '/images/default-avatar.png')}
                    alt={selectedConversation.username}
                    className="avatar-medium"
                  />
                  <h3>{selectedConversation.username}</h3>
                </>
              )}
            </div>

            <div className="messages-container">
              {loading ? (
                <div className="loading-state">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="empty-state">No messages yet. Start the conversation!</div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={msg._id || idx}
                    className={`message ${msg.from === currentUserId ? 'sent' : 'received'}`}
                  >
                    <div className="message-bubble">
                      <p>{msg.message}</p>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className="message-input"
              />
              <button
                onClick={sendMessage}
                disabled={!messageText.trim()}
                className="send-button"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="chat-empty-state">
            <p>Select a conversation or search to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
