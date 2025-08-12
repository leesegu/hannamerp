
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const CriticalPatients: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [
    {
      name: "Orthopedics",
      data: [
        10, 15, 21, 25, 19, 15, 25, 20, 20, 15, 21, 25, 17, 18, 15, 20, 15, 20,
        18, 13,
      ],
    },
    {
      name: "Cardiology",
      data: [3, 7, 7, 10, 9, 7, 15, 3, 7, 7, 10, 9, 7, 13, 3, 7, 7, 10, 9, 7],
    },
  ];

  const options: ApexOptions = {
    chart: {
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false,
      },
    },
    colors: ["#FD5812", "#796DF6"],
    dataLabels: {
      enabled: false,
    },
    grid: {
      show: false,
      borderColor: "#ECEEF2",
    },
    stroke: {
      curve: "straight",
      width: 2,
    },
    xaxis: {
      categories: [
        "01 Jan",
        "02 Jan",
        "03 Jan",
        "04 Jan",
        "05 Jan",
        "06 Jan",
        "07 Jan",
        "08 Jan",
        "09 Jan",
        "10 Jan",
        "11 Jan",
        "12 Jan",
        "13 Jan",
        "14 Jan",
        "15 Jan",
        "16 Jan",
        "17 Jan",
        "18 Jan",
        "19 Jan",
        "20 Jan",
      ],
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      labels: {
        show: false,
        style: {
          colors: "#8695AA",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      // tickAmount: 6,
      show: false,
      max: 25,
      min: 0,
      labels: {
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
      },
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
    },
    legend: {
      show: false,
      position: "top",
      fontSize: "12px",
      horizontalAlign: "left",
      itemMargin: {
        horizontal: 8,
        vertical: 0,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: -0.5,
        shape: "circle",
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] mb-[25px] p-[20px] md:p-[25px] md:px-[20px] rounded-md relative">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <p className="mb-[2px]">Critical Patients</p>
            <h5 className="!mb-0">780</h5>
          </div>
        </div>

        <div className="trezo-card-content">
          <div className="absolute top-[100px] left-[10px] right-[10px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="area"
                height={120}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>

          <ul className="mt-[160px]">
            <li className="relative text-sm ltr:pl-[18px] rtl:pr-[18px] mb-[10px] last:mb-0">
              <span className="block absolute ltr:left-0 rtl:right-0 w-[12px] h-[2px] bg-primary-500 top-1/2 -translate-y-1/2"></span>
              Cardiology:
              <span className="text-black dark:text-white font-semibold">
                280
              </span>
            </li>

            <li className="relative text-sm ltr:pl-[18px] rtl:pr-[18px] mb-[10px] last:mb-0">
              <span className="block absolute ltr:left-0 rtl:right-0 w-[12px] h-[2px] bg-orange-500 top-1/2 -translate-y-1/2"></span>
              Orthopedics:
              <span className="text-black dark:text-white font-semibold">
                600
              </span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};

export default CriticalPatients;
