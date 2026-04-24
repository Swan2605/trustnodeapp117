import React from 'react';
import ProfilePanel from './ProfilePanel';
import TrendingTopics from './TrendingTopics';
import PostFeed from './PostFeed';

const Dashboard = ({
  profile,
  onProfileUpdate,
  onPostCreated = () => {},
  onPostDeleted = () => {},
  onViewProfile = () => {}
}) => {
  return (
    <div className="dashboard-layout">
      <aside className="left-panel">
        <ProfilePanel profile={profile} onProfileUpdate={onProfileUpdate} />
      </aside>
      <main className="main-content">
        <div className="feed-box">
          <PostFeed
            profile={profile}
            onPostCreated={onPostCreated}
            onPostDeleted={onPostDeleted}
            onViewProfile={onViewProfile}
          />
        </div>
      </main>
      <aside className="right-panel">
        <TrendingTopics />
      </aside>
    </div>
  );
};

export default Dashboard;
