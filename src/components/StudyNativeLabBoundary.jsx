import React from 'react';

// A failed native chunk must not take the written lesson or other desks down.
export default class StudyNativeLabBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) {
      return <p role="status" data-quantora-study-lab-unavailable="true">
        The interactive view could not load. The written lesson is still available.
      </p>;
    }
    return this.props.children;
  }
}
