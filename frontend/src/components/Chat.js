import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const socket = io(API_BASE);

const Chat = ({ profile, isOpen, onClose }) => {
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const messagesEndRef = useRef(null);

  // Typing timer
  useEffect(() => {
    let typingTimer;
    if (messageText && selectedUserId) {
      setIsTyping(true);
      socket.emit('typing', { to: selectedUserId, isTyping: true });
      typingTimer = setTimeout(() => {
        setIsTyping(false);
        socket.emit('typing', { to: selectedUserId, isTyping: false });
      }, 1000);
    } else {
      setIsTyping(false);
    }
    return () => clearTimeout(typingTimer);
  }, [messageText]);

  const token = localStorage.getItem('token');
  const currentUserId = profile?._id;

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversations on mount and periodically refresh
  useEffect(() => {
    if (token) {
      fetchConversations();
      // Refresh conversations every 3 seconds to catch new messages
      const interval = setInterval(fetchConversations, 3000);
      return () => clearInterval(interval);
    }
  }, [token]);

  // Join socket room and listen for incoming messages
  useEffect(() => {
    if (currentUserId) {
      socket.emit('join-conversation', currentUserId);
    }

const handleReceiveMessage = (data) => {
      // Always refresh conversations
      fetchConversations();
      
      // Add to current chat if viewing this conversation
      if (selectedUserId && (data.from === selectedUserId || data.to === currentUserId)) {
        setMessages(prev => [...prev, data]);
      }
    };

    socket.on('receive-message', handleReceiveMessage);
    
    const handleTyping = (data) => {
      if (data.to === currentUserId && data.from === selectedUserId) {
        setIsTyping(data.isTyping);
      }
    };
    socket.on('typing', handleTyping);
    
    return () => {
      socket.off('receive-message', handleReceiveMessage);
      socket.off('typing', handleTyping);
    };
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

  const searchPeople = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/api/profile/search?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(res.data.results.filter(user => user.isFriend && user._id !== currentUserId));
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const fetchMessages = async (userId) => {
    try {
      setLoading(true);
      setSelectedUserId(userId);
      setMessages([]);
      setShowSearch(false);

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
    if (!messageText.trim() || !selectedUserId) {
      console.warn('❌ Cannot send: messageText=', messageText, 'selectedUserId=', selectedUserId);
      return;
    }

    if (!token || !currentUserId) {
      console.error('❌ Missing auth: token=', !!token, 'currentUserId=', currentUserId);
      alert('Error: Not logged in');
      return;
    }

    try {
      console.log('📤 Sending message to:', selectedUserId, 'Message:', messageText);

      // Add optimistic message immediately
      setMessages(prev => [...prev, {
        _id: Date.now(),
        from: currentUserId,
        to: selectedUserId,
        message: messageText,
        timestamp: new Date(),
        isOptimistic: true
      }]);

      // Send via REST API (persists to DB)
      const response = await axios.post(
        `${API_BASE}/api/chat/send`,
        {
          to: selectedUserId,
          message: messageText
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ Message sent successfully:', response.data);

      // Replace optimistic message with real DB message
      setMessages(prev =>
        prev.map(msg =>
          msg.isOptimistic && msg.from === currentUserId
            ? { ...response.data, timestamp: new Date(response.data.timestamp) }
            : msg
        )
      );

      // Refresh conversations list
      fetchConversations();

      // Emit to Socket.IO for real-time recipient notification
      socket.emit('send-message', {
        _id: response.data._id,
        from: currentUserId,
        to: selectedUserId,
        message: messageText,
        timestamp: response.data.timestamp
      });

      setMessageText('');
    } catch (error) {
      console.error('❌ Failed to send message:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.response?.data?.msg || error.message,
        fullError: error
      });
      
      // Remove optimistic message on error
      setMessages(prev =>
        prev.filter(msg => !msg.isOptimistic || msg.from !== currentUserId)
      );
      
      alert(`Failed to send message: ${error.response?.data?.msg || error.message}`);
    }
  };

  const selectedConversation = conversations.find(c => c._id === selectedUserId);

  if (!isOpen) return null;

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-modal-header">
          <div className="chat-modal-title">
            <span className="chat-icon">💬</span>
            <div>
              <h3>Messages</h3>
              <p>{conversations.length} conversations</p>
            </div>
          </div>
          <button className="chat-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Main Content */}
        <div className="chat-modal-content">
          {/* Conversations Sidebar */}
          <div className="chat-sidebar-modal">
            {/* Search Box */}
            <div className="chat-search-box">
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchPeople(e.target.value);
                }}
                className="search-input-modal"
              />
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="search-results-modal">
                {searchResults.map(user => (
                  <div
                    key={user._id}
                    className="search-result-item-modal"
                    onClick={() => fetchMessages(user._id)}
                  >
                    <div className="result-avatar">
                      <img
                        src={user.profile?.avatar || '/images/default-avatar.png'}
                        alt={user.username}
                      />
                    </div>
                    <div className="result-info">
                      <h4>{user.username}</h4>
                      <p>{user.profile?.jobTitle || 'Connection'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Conversations List */}
            {searchResults.length === 0 && (
              <>
                {conversations.length === 0 ? (
                  <div className="empty-conversations">
                    <p>No conversations yet</p>
                  </div>
                ) : (
                  <>
                    {conversations.some(c => c.unreadCount > 0) && (
                      <div className="conversation-section">
                        <h5 className="section-header">UNREAD</h5>
                        {conversations
                          .filter(c => c.unreadCount > 0)
                          .map(conv => (
                            <div
                              key={conv._id}
                              className={`conversation-item-modal ${selectedUserId === conv._id ? 'active' : ''}`}
                              onClick={() => fetchMessages(conv._id)}
                            >
                              <div className="conv-avatar">
                                <img
                                  src={conv.avatar || '/images/default-avatar.png'}
                                  alt={conv.username}
                                />
                              </div>
                              <div className="conv-info">
                                <div className="conv-header">
                                  <h4>{conv.username}</h4>
                                  <span className="conv-time">
                                    {new Date(conv.lastMessageTime).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                </div>
                                <p className="conv-last-msg">
                                  {conv.lastMessage?.substring(0, 40)}
                                </p>
                              </div>
                              {conv.unreadCount > 0 && (
                                <span className="unread-dot"></span>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {conversations.filter(c => c.unreadCount === 0).length > 0 && (
                      <div className="conversation-section">
                        {conversations.filter(c => c.unreadCount === 0).map(conv => (
                          <div
                            key={conv._id}
                            className={`conversation-item-modal ${selectedUserId === conv._id ? 'active' : ''}`}
                            onClick={() => fetchMessages(conv._id)}
                          >
                            <div className="conv-avatar">
                              <img
                                src={conv.avatar || '/images/default-avatar.png'}
                                alt={conv.username}
                              />
                            </div>
                            <div className="conv-info">
                              <div className="conv-header">
                                <h4>{conv.username}</h4>
                                <span className="conv-time">
                                  {new Date(conv.lastMessageTime).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </span>
                              </div>
                              <p className="conv-last-msg">
                                {conv.lastMessage?.substring(0, 40)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* New Message Button */}
                <button className="new-message-btn" onClick={() => setShowSearch(!showSearch)}>
                  + New message
                </button>
              </>
            )}
          </div>

          {/* Messages Area */}
          {selectedUserId ? (
            <div className="chat-messages-modal">
              <div className="chat-messages-header">
                {selectedConversation && (
                  <>
                    <img
                      src={selectedConversation.avatar || '/images/default-avatar.png'}
                      alt={selectedConversation.username}
                    />
                    <h4>{selectedConversation.username}</h4>
                  </>
                )}
              </div>

              <div className="messages-list-modal">
                {loading ? (
                  <div className="loading-msg">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="empty-msg">No messages yet. Start the conversation!</div>
                ) : isTyping ? (
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                    <p>{selectedConversation?.username || 'User'} is typing...</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={msg._id || idx}
                      className={`message-item-modal ${msg.from === currentUserId ? 'sent' : 'received'}`}
                    >
                      <div className="message-bubble-modal">
                        {msg.message}
                        <span className="msg-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-modal">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  className="message-input-modal"
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageText.trim()}
                  className="send-btn-modal"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="chat-empty-modal">
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;
