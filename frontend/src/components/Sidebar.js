import React from 'react';

const Sidebar = () => {
  return (
    <aside className="side-panel">
      <div className="sidebar-card">
        <h3>Secure Workspace</h3>
        <p>End-to-end encrypted messaging, audit-ready networking, and confidential vulnerability discussions.</p>
      </div>
      <div className="sidebar-card">
        <h3>Network Pulse</h3>
        <ul>
          <li>12 new validation requests</li>
          <li>7 fresh exploit reports</li>
          <li>3 critical audit alerts</li>
        </ul>
      </div>
      <div className="sidebar-card">
        <h3>Quick Actions</h3>
        <button className="ghost-btn">Post a write-up</button>
        <button className="ghost-btn">Start encrypted chat</button>
      </div>
    </aside>
  );
};

export default Sidebar;
