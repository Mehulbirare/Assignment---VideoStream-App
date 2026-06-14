cmake_minimum_required(VERSION 3.18)
project(edgevision_tests CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Desktop OpenCV (e.g. `brew install opencv`, `apt install libopencv-dev`,
# or `vcpkg install opencv4`). These tests run on your dev machine, not the
# device, so they validate the pure C++ effect logic with no Android/JNI.
find_package(OpenCV REQUIRED)

include(FetchContent)
FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

enable_testing()

# Shared C++ core lives at the repo root (../../../../../../cpp from here).
set(SHARED_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../../cpp)

add_executable(
        image_processor_tests
        test_image_processor.cpp
        ${SHARED_CPP_DIR}/ImageProcessor.cpp)

target_include_directories(
        image_processor_tests
        PRIVATE
        ${SHARED_CPP_DIR}
        ${OpenCV_INCLUDE_DIRS})

target_link_libraries(
        image_processor_tests
        PRIVATE
        GTest::gtest_main
        ${OpenCV_LIBS})

include(GoogleTest)
gtest_discover_tests(image_processor_tests)
