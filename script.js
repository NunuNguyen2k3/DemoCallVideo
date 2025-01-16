const videoContainer = document.querySelector("#videos");

const vm = new Vue({
  el: "#app",
  data: {
    userToken: "",
    roomId: "",
    roomToken: "",
    room: undefined,
    callClient: undefined,
    localTracks: [],
    subscribedTracks: [],
    inRoom: false
  },
  computed: {
    roomUrl: function () {
      return `https://${location.hostname}?room=${this.roomId}`;
    }
  },
  async mounted() {
    api.setRestToken();

    const urlParams = new URLSearchParams(location.search);
    const roomId = urlParams.get("room");
    if (roomId) {
      this.roomId = roomId;

      await this.join();
    }
    window.addEventListener("beforeunload", () => {
      if (this.room) {
        this.leaveRoom(this.room);
      }
    });
  },
  methods: {
    authen: function () {
      return new Promise(async resolve => {
        const userId = `${(Math.random() * 100000).toFixed(6)}`;
        const userToken = await api.getUserToken(userId);
        this.userToken = userToken;

        if (!this.callClient || this.callClient._state !== 'connected') {
          const client = new StringeeClient();

          client.on("authen", function (res) {
            console.log("on authen: ", res);
            resolve(res);
          });
          this.callClient = client;
        }
        this.callClient.connect(userToken);
      });
    },
    publish: async function (screenSharing = false) {
      console.log("hello");
      const localTrack = await StringeeVideo.createLocalVideoTrack(
        this.callClient,
        {
          audio: true,
          video: true,
          screen: screenSharing,
          videoDimensions: { width: 640, height: 360 }
        }
      );

      this.localTracks.push(localTrack);
      const videoElement = localTrack.attach();
      this.addVideo(videoElement);

      const roomData = await StringeeVideo.joinRoom(
        this.callClient,
        this.roomToken
      );
      const room = roomData.room;
      console.log({ roomData, room });

      if (!this.room) {
        this.room = room;
        room.clearAllOnMethos();
        room.on("addtrack", e => {
          const track = e.info.track;

          console.log("addtrack", track);
          if (track.serverId === localTrack.serverId) {
            console.log("local");
            return;
          }
          this.subscribe(track);
        });
        room.on("removetrack", e => {
          const track = e.track;
          if (!track) {
            return;
          }
        
          console.log("Track bị xóa: ", track);
          this.subscribedTracks = this.subscribedTracks.filter(t => t.serverId !== track.serverId);
        
          const mediaElements = track.detach();
          mediaElements.forEach(element => {
            element.remove(); // Xóa video khỏi giao diện
          });
        });        

        // Join existing tracks
        roomData.listTracksInfo.forEach(info => this.subscribe(info));
      }

      await room.publish(localTrack);
      console.log("room publish successful");
    },
    createRoom: async function () {
      this.inRoom = true;
      const room = await api.createRoom();
      const { roomId } = room;
      const roomToken = await api.getRoomToken(roomId);
    
      this.roomId = roomId;
      this.roomToken = roomToken;
    
      console.log({ roomId, roomToken });
    
      // Cập nhật URL khi tạo phòng
      window.history.pushState({}, "", `?room=${roomId}`);
    
      await this.authen();
      await this.publish();
    },
    
    join: async function () {
      this.inRoom = true;
    
      const roomToken = await api.getRoomToken(this.roomId);
      this.roomToken = roomToken;
    
      // Cập nhật URL khi tham gia phòng
      window.history.pushState({}, "", `?room=${this.roomId}`);
    
      await this.authen();
      await this.publish();
    },
    
    joinWithId: async function () {
      const roomId = prompt("Dán Room ID vào đây nhé!");
    
      if (roomId) {
        this.roomId = roomId;
        this.inRoom = true;
    
        // Cập nhật URL khi nhập Room ID
        window.history.pushState({}, "", `?room=${roomId}`);
    
        await this.join();
      }
    },
    
    subscribe: async function(trackInfo) {
      const track = await this.room.subscribe(trackInfo.serverId);
      track.on("ready", () => {
        const videoElement = track.attach();
        this.addVideo(videoElement);
      });
    },
    addVideo: function (video) {
      if (video && videoContainer) {
        // Kiểm tra nếu video đã có trong container hay chưa
        if (!videoContainer.contains(video)) {
          video.setAttribute("controls", "true");
          video.setAttribute("playsinline", "true");
          videoContainer.appendChild(video);
        }
      } else {
        console.error("Video or container is undefined.");
      }
    },

    leaveRoom: function () {
      if (this.room) {
        console.log("Thoát khỏi phòng...");
    
        this.room.leave(true);
        videoContainer.innerHTML = "";
    
        this.localTracks.forEach(function (track) {
          if (track && typeof track.close === "function") {
            track.close();
          }
          if (track && typeof track.detach === "function") {
            const mediaElements = track.detach();
            mediaElements.forEach(element => element.remove());
          }
        });
    
        this.subscribedTracks.forEach(function (track) {
          if (track && typeof track.detach === "function") {
            const mediaElements = track.detach();
            mediaElements.forEach(element => element.remove());
          }
        });
    
        // Reset trạng thái
        this.localTracks = [];
        this.subscribedTracks = [];
        this.roomId = "";
        this.roomToken = "";
        this.inRoom = false;
        this.room = undefined;
    
        console.log("Đã thoát phòng.");
    
        // Điều hướng về trang chủ
        window.history.pushState({}, "", "/");
      } else {
        console.warn("Không có phòng nào để thoát.");
      }
    },
    
    turnOffMic: function () {

    },

    turnOffCam: function () {
      this.localTracks.forEach(function (track) {
        if (track.screen) {
          return;
        }

        console.log('hien tai track.localVideoEnabled=' + track.localVideoEnabled);

        if (track.localVideoEnabled) {
          // Tắt video
          track.enableLocalVideo(false);
          document.getElementById('disableVideoBtn').innerHTML = 'Bật Camera';
        } else {
          // Bật video
          track.enableLocalVideo(true);
          document.getElementById('disableVideoBtn').innerHTML = 'Tắt Camera';
        }
      });
    }
  }
});
