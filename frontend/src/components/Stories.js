import React from 'react';

const Stories = () => {
  const stories = ['user1', 'user2', 'user3'];
  return (
    <div className="stories">
      {stories.map((story, i) => (
        <div key={i} className="story">
          <div className="story-ring"></div>
          <img src={`/story${i}.png`} alt={story} className="story-avatar" />
          <span>{story}</span>
        </div>
      ))}
    </div>
  );
};

export default Stories;
